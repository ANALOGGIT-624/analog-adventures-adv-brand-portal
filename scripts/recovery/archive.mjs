import { Buffer } from "node:buffer";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  lstat,
  open,
} from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import path from "node:path";

const MAGIC = Buffer.from("AABKP001");
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export async function hashFile(filename) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(filename)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest("hex"), bytes: size };
}
export function safeRelative(name) {
  if (
    typeof name !== "string" ||
    !name ||
    name.includes("\\") ||
    name.includes("\0") ||
    path.posix.isAbsolute(name) ||
    name.split("/").some((p) => !p || p === "." || p === "..")
  ) {
    throw new Error("Unsafe archive path");
  }
  return name;
}
export async function loadKey(filename) {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error("Key must be a private regular file (0600)");
  const key = await readFile(filename);
  if (key.length !== 32) throw new Error("Invalid recovery key length");
  return key;
}
export async function createKey(filename) {
  await writeFile(filename, randomBytes(32), { flag: "wx", mode: 0o600 });
}
async function encryptFile(source, destination, key, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const out = createWriteStream(destination, { flags: "wx", mode: 0o600 });
  out.write(Buffer.concat([MAGIC, iv]));
  await pipeline(createReadStream(source), cipher, out, { end: false });
  await new Promise((resolve, reject) => {
    out.on("error", reject);
    out.end(cipher.getAuthTag(), resolve);
  });
}
async function decryptFile(source, destination, key, aad) {
  const stat = await lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 36)
    throw new Error("Invalid encrypted object");
  const fd = await open(source, "r");
  const header = Buffer.alloc(20),
    tag = Buffer.alloc(16);
  try {
    await fd.read(header, 0, 20, 0);
    await fd.read(tag, 0, 16, stat.size - 16);
  } finally {
    await fd.close();
  }
  if (!header.subarray(0, 8).equals(MAGIC))
    throw new Error("Invalid backup format");
  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(8));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  const sourceStream =
    stat.size === 36
      ? (async function* () {})()
      : createReadStream(source, { start: 20, end: stat.size - 17 });
  await pipeline(
    sourceStream,
    decipher,
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
}
async function listFiles(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), {
    withFileTypes: true,
  })) {
    const relative = safeRelative(
      prefix ? `${prefix}/${entry.name}` : entry.name,
    );
    if (entry.isDirectory()) result.push(...(await listFiles(root, relative)));
    else if (entry.isFile()) result.push(relative);
    else throw new Error("Backup refuses symlinks and special files");
  }
  return result.sort();
}
export async function sealDirectory(
  source,
  destination,
  keyFile,
  metadata = {},
) {
  const key = await loadKey(keyFile);
  await mkdir(destination, { mode: 0o700 });
  await mkdir(path.join(destination, "objects"), { mode: 0o700 });
  const entries = [];
  for (const relative of await listFiles(source)) {
    const sourceFile = path.join(source, relative);
    const before = await hashFile(sourceFile);
    const object = `objects/${sha256(Buffer.from(relative))}.enc`;
    const encrypted = path.join(destination, object);
    await encryptFile(sourceFile, encrypted, key, relative);
    const after = await hashFile(sourceFile);
    if (before.sha256 !== after.sha256 || before.bytes !== after.bytes)
      throw new Error("Source changed during sealing");
    entries.push({
      path: relative,
      object,
      ...before,
      encryptedSha256: (await hashFile(encrypted)).sha256,
    });
  }
  const manifest = {
    format: "analog-recovery-v1",
    createdAt: new Date().toISOString(),
    metadata,
    entries,
  };
  // Manifest itself is encrypted; filenames and source metadata stay private.
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("manifest"));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(manifest)),
    cipher.final(),
  ]);
  await writeFile(
    path.join(destination, "manifest.enc"),
    Buffer.concat([MAGIC, iv, bytes, cipher.getAuthTag()]),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    path.join(destination, "COMPLETE.json"),
    JSON.stringify({
      format: manifest.format,
      files: entries.length,
      manifestSha256: (await hashFile(path.join(destination, "manifest.enc")))
        .sha256,
    }),
    { flag: "wx", mode: 0o600 },
  );
  key.fill(0);
  return {
    files: entries.length,
    bytes: entries.reduce((n, e) => n + e.bytes, 0),
  };
}
export async function restoreDirectory(source, destination, keyFile) {
  const complete = JSON.parse(
    await readFile(path.join(source, "COMPLETE.json"), "utf8"),
  );
  const manifestFile = path.join(source, "manifest.enc");
  if (
    complete.format !== "analog-recovery-v1" ||
    (await hashFile(manifestFile)).sha256 !== complete.manifestSha256
  )
    throw new Error("Incomplete or damaged backup");
  const key = await loadKey(keyFile),
    data = await readFile(manifestFile);
  if (!data.subarray(0, 8).equals(MAGIC)) throw new Error("Invalid manifest");
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(8, 20));
  decipher.setAAD(Buffer.from("manifest"));
  decipher.setAuthTag(data.subarray(-16));
  const manifest = JSON.parse(
    Buffer.concat([
      decipher.update(data.subarray(20, -16)),
      decipher.final(),
    ]).toString(),
  );
  if (
    manifest.format !== complete.format ||
    manifest.entries.length !== complete.files
  )
    throw new Error("Invalid manifest entries");
  const seen = new Set();
  for (const entry of manifest.entries) {
    safeRelative(entry.path);
    if (
      seen.has(entry.path) ||
      entry.object !== `objects/${sha256(Buffer.from(entry.path))}.enc`
    )
      throw new Error("Invalid or duplicate archive entry");
    seen.add(entry.path);
    if (
      (await hashFile(path.join(source, entry.object))).sha256 !==
      entry.encryptedSha256
    )
      throw new Error("Damaged encrypted object");
  }
  // Never overwrite an existing directory or write to a live app/database.
  await mkdir(destination, { mode: 0o700 });
  for (const entry of manifest.entries) {
    const target = path.join(destination, entry.path);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await decryptFile(path.join(source, entry.object), target, key, entry.path);
    const actual = await hashFile(target);
    if (actual.sha256 !== entry.sha256 || actual.bytes !== entry.bytes)
      throw new Error("Restored bytes differ from manifest");
  }
  await writeFile(
    path.join(destination, "RESTORE-VERIFIED.json"),
    JSON.stringify(
      {
        restoredAt: new Date().toISOString(),
        files: manifest.entries.length,
        metadata: manifest.metadata,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  key.fill(0);
  return manifest;
}

// A hashing transform is also used while downloading source objects.
export function hashingStream() {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      bytes += chunk.length;
      callback(null, chunk);
    },
  });
  return { stream, result: () => ({ sha256: hash.digest("hex"), bytes }) };
}
