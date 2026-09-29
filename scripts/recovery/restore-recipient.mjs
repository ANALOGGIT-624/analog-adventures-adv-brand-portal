import process from "node:process";
import { createPrivateKey } from "node:crypto";
import { readFile, writeFile, lstat, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { unwrapKey } from "./recipient.mjs";
import { restoreDirectory } from "./archive.mjs";

export async function restoreRecipient(source, privateFile, destination) {
  process.umask(0o077);
  const st = await lstat(privateFile);
  if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077) throw new Error("Private recipient file must be owner-only");
  const privateKey = createPrivateKey(await readFile(privateFile));
  const envelope = JSON.parse(await readFile(path.join(source, "recipient.json"), "utf8"));
  const key = unwrapKey(envelope, privateKey);
  const temp = await mkdtemp(path.join(os.tmpdir(), "portal-unwrap-"));
  try {
    const keyFile = path.join(temp, "key");
    await writeFile(keyFile, key, { mode: 0o600, flag: "wx" });
    key.fill(0);
    return await restoreDirectory(source, destination, keyFile);
  } finally { key.fill(0); await rm(temp, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, privateFile, destination] = process.argv.slice(2);
  try {
    if (!source || !privateFile || !destination) throw new Error("Missing arguments");
    const result = await restoreRecipient(source, privateFile, destination);
    console.log(JSON.stringify({ restoredFiles: result.entries.length }));
  } catch { console.error("Recipient restore failed; no credentials logged"); process.exitCode = 1; }
}
