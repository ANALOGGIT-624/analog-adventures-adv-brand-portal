import test from "node:test";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { parseRecipient, wrapKey, unwrapKey } from "../scripts/recovery/recipient.mjs";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { configuration, databaseEnvironment, transferVerified, ping } from "../scripts/recovery/scheduled-postgres.mjs";
import { createKey, sealDirectory, restoreDirectory } from "../scripts/recovery/archive.mjs";

const pair = generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicEncoded = Buffer.from(pair.publicKey.export({type:"spki",format:"pem"})).toString("base64");
const env = {
  DATABASE_URL: "postgresql://fixture:fixture@dpg-daql1l1srm7s73dfn2rg-a/analog_portal_pilot?sslmode=require",
  BACKUP_PUBLIC_KEY_BASE64: publicEncoded,
  B2_ACCESS_KEY_ID: "fixture", B2_SECRET_ACCESS_KEY: "fixture",
  BACKUP_MONITOR_URL: "https://hc-ping.com/00000000-0000-0000-0000-000000000000",
};
test("libpq receives remote connection fields and decoded credentials, not a URI database name", () => {
  const child = databaseEnvironment("postgresql://backup:p%40ss%3Aword@database-host:5440/pilot?sslmode=require", "/bin");
  assert.equal(child.PGHOST, "database-host");
  assert.equal(child.PGPORT, "5440");
  assert.equal(child.PGDATABASE, "pilot");
  assert.equal(child.PGUSER, "backup");
  assert.equal(child.PGPASSWORD, "p@ss:word");
  assert.equal(child.PGSSLMODE, "require");
  assert.equal(databaseEnvironment(env.DATABASE_URL, "/bin").PGPORT, "5432");
});
test("configuration refuses wrong database, missing TLS and untrusted monitor", () => {
  assert.equal(configuration(env).recipient.asymmetricKeyType, "rsa");
  for (const change of [
    { DATABASE_URL: env.DATABASE_URL.replace("analog_portal_pilot", "other") },
    { DATABASE_URL: env.DATABASE_URL.replace("sslmode=require", "sslmode=disable") },
    { BACKUP_MONITOR_URL: "https://example.com/collect" },
    { BACKUP_PUBLIC_KEY_BASE64: "short" },
  ]) assert.throws(() => configuration({ ...env, ...change }));
});

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "scheduled-backup-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "source"));
  await writeFile(path.join(root, "source", "database.dump"), "synthetic database fixture");
  await createKey(path.join(root, "key"));
  await sealDirectory(path.join(root, "source"), path.join(root, "sealed"), path.join(root, "key"));
  await writeFile(path.join(root, "sealed", "recipient.json"), JSON.stringify(wrapKey(await readFile(path.join(root, "key")), pair.publicKey)));
  return root;
}
function storage(corrupt = false) {
  const data = new Map(), operations = [];
  return { data, operations, async send(command) {
    const { Key, Body } = command.input;
    operations.push({ type: command.constructor.name, key: Key });
    if (Body) {
      const chunks = []; for await (const chunk of Body) chunks.push(chunk);
      data.set(Key, Buffer.concat(chunks)); return {};
    }
    return { Body: Readable.from([corrupt ? Buffer.from("damaged") : data.get(Key)]) };
  } };
}
test("offsite transfer roundtrips encrypted bytes and publishes completion last", async t => {
  const root = await fixture(t), client = storage();
  await transferVerified({ client, bucket: "fixture", prefix: "unique/", sealed: path.join(root, "sealed"), download: path.join(root, "download") });
  await restoreDirectory(path.join(root, "download"), path.join(root, "restored"), path.join(root, "key"));
  assert.equal(await readFile(path.join(root, "restored", "database.dump"), "utf8"), "synthetic database fixture");
  assert.equal(client.operations.filter(o => o.type === "PutObjectCommand").at(-1).key, "unique/COMPLETE.json");
  assert.ok(client.operations.every(o => !o.type.startsWith("Delete")));
});
test("corrupt read-back fails before a completion marker is published", async t => {
  const root = await fixture(t), client = storage(true);
  await assert.rejects(transferVerified({ client, bucket: "fixture", prefix: "unique/", sealed: path.join(root, "sealed"), download: path.join(root, "download") }), /mismatch/);
  assert.equal(client.data.has("unique/COMPLETE.json"), false);
});
test("monitor receives no backup contents and HTTP errors fail the run", async () => {
  let observed;
  await ping(env.BACKUP_MONITOR_URL, "", async (url, options) => { observed = { url, options }; return { ok: true }; });
  assert.equal(observed.options.body, "");
  assert.equal(observed.options.redirect, "error");
  await assert.rejects(ping(env.BACKUP_MONITOR_URL, "", async () => ({ ok: false })), /unavailable/);
});

test("only matching private key unwraps an archive key; tampering fails", () => {
  const key = randomBytes(32), envelope = wrapKey(key, parseRecipient(publicEncoded));
  assert.deepEqual(unwrapKey(envelope, pair.privateKey), key);
  const damaged = Buffer.from(envelope.wrappedKey, "base64"); damaged[12] ^= 1;
  assert.throws(() => unwrapKey({...envelope, wrappedKey:damaged.toString("base64")}, pair.privateKey));
  const other = generateKeyPairSync("rsa", {modulusLength:3072});
  assert.throws(() => unwrapKey(envelope, other.privateKey), /Wrong recovery recipient/);
  const privateEncoded = Buffer.from(pair.privateKey.export({type:"pkcs8",format:"pem"})).toString("base64");
  assert.throws(() => parseRecipient(privateEncoded), /Public recipient key required/);
});
