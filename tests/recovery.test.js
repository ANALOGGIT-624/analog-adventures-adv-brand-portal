import { Buffer } from "node:buffer";
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  symlink,
  rm,
  access,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createKey,
  sealDirectory,
  restoreDirectory,
  safeRelative,
  loadKey,
} from "../scripts/recovery/archive.mjs";
import { collectPages } from "../scripts/recovery/capture.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-recovery-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source"),
    backup = path.join(root, "backup"),
    key = path.join(root, "key");
  await mkdir(source, { mode: 0o700 });
  await mkdir(path.join(source, "nested"));
  await writeFile(
    path.join(source, "nested", "example.json"),
    '{"proof":"historical","version":1}',
  );
  await writeFile(path.join(source, "empty.bin"), Buffer.alloc(0));
  await writeFile(
    path.join(source, "bytes.bin"),
    Buffer.from([0, 1, 255, 13, 10]),
  );
  await createKey(key);
  return { root, source, backup, key, restored: path.join(root, "restored") };
}
test("encrypted recovery roundtrip preserves exact bytes and empty files", async (t) => {
  const f = await fixture(t);
  const summary = await sealDirectory(f.source, f.backup, f.key, {
    scope: "synthetic",
  });
  assert.equal(summary.files, 3);
  const manifest = await restoreDirectory(f.backup, f.restored, f.key);
  for (const entry of manifest.entries)
    assert.deepEqual(
      await readFile(path.join(f.source, entry.path)),
      await readFile(path.join(f.restored, entry.path)),
    );
  assert.equal(manifest.metadata.scope, "synthetic");
  await access(path.join(f.restored, "RESTORE-VERIFIED.json"));
  assert.equal(
    (await readFile(path.join(f.backup, "manifest.enc"))).includes(
      Buffer.from("example.json"),
    ),
    false,
  );
});
test("wrong key cannot create a restoration directory", async (t) => {
  const f = await fixture(t);
  await sealDirectory(f.source, f.backup, f.key);
  const wrong = path.join(f.root, "wrong");
  await createKey(wrong);
  await assert.rejects(restoreDirectory(f.backup, f.restored, wrong));
  await assert.rejects(access(f.restored));
});
test("tampered ciphertext is rejected before restore", async (t) => {
  const f = await fixture(t);
  await sealDirectory(f.source, f.backup, f.key);
  const manifest = await restoreDirectory(f.backup, f.restored, f.key);
  const target = path.join(f.backup, manifest.entries[0].object),
    bytes = await readFile(target);
  bytes[21] ^= 1;
  await writeFile(target, bytes);
  const another = path.join(f.root, "another");
  await assert.rejects(
    restoreDirectory(f.backup, another, f.key),
    /Damaged encrypted object/,
  );
  await assert.rejects(access(another));
});
test("restore refuses to overwrite an existing directory", async (t) => {
  const f = await fixture(t);
  await sealDirectory(f.source, f.backup, f.key);
  await mkdir(f.restored);
  await writeFile(path.join(f.restored, "keep"), "preserve");
  await assert.rejects(restoreDirectory(f.backup, f.restored, f.key), /EEXIST/);
  assert.equal(
    await readFile(path.join(f.restored, "keep"), "utf8"),
    "preserve",
  );
});
test("incomplete backup and symlink sources fail closed", async (t) => {
  const f = await fixture(t);
  await symlink(path.join(f.source, "bytes.bin"), path.join(f.source, "link"));
  await assert.rejects(sealDirectory(f.source, f.backup, f.key), /symlinks/);
  await assert.rejects(restoreDirectory(f.backup, f.restored, f.key));
});
test("keys must be private and are never overwritten", async (t) => {
  const f = await fixture(t);
  await assert.rejects(createKey(f.key), /EEXIST/);
  await chmod(f.key, 0o644);
  await assert.rejects(loadKey(f.key), /private/);
});
test("archive paths cannot escape the destination", () => {
  for (const name of [
    "../secret",
    "/tmp/secret",
    "a/../b",
    "a\\b",
    "a//b",
    "./a",
    "",
  ])
    assert.throws(() => safeRelative(name));
  assert.equal(safeRelative("records/orders.json"), "records/orders.json");
});
test("pagination captures every page and rejects a stalled cursor", async () => {
  const calls = [];
  const result = await collectPages(async (cursor) => {
    calls.push(cursor);
    return cursor
      ? { nodes: [2], pageInfo: { hasNextPage: false } }
      : { nodes: [1], pageInfo: { hasNextPage: true, endCursor: "next" } };
  });
  assert.deepEqual(result, [1, 2]);
  assert.deepEqual(calls, [null, "next"]);
  await assert.rejects(
    collectPages(async () => ({
      nodes: [],
      pageInfo: { hasNextPage: true, endCursor: "same" },
    })),
    /stalled/,
  );
  await assert.rejects(
    collectPages(async () => ({ nodes: [] })),
    /Invalid/,
  );
});
