import { DEVELOPMENT_SCOPE, LIVE_SCOPE } from "../../app/lib/deployment-scope.js";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { hashFile, sha256 } from "./archive.mjs";

export const BACKUP_BUCKET = "analog-adventures-portal-backups";
const ROOT = DEVELOPMENT_SCOPE.backupRoot;
function checkedRoot(root) {
  if (![ROOT, LIVE_SCOPE.backupRoot].includes(root)) throw new Error("Unknown recovery scope");
  return root;
}
// Bound memory on the worker; larger objects fail while daily copies remain.
const MAX_BYTES = 32 * 1024 * 1024;

// Only encrypted bytes and non-secret integrity metadata leave the daily job.
export async function archiveReceipt(sealed, prefix) {
  const files = [...(await readdir(path.join(sealed, "objects"))).sort().map(n => `objects/${n}`),
    "recipient.json", "manifest.enc", "COMPLETE.json"];
  const objects = [];
  for (const name of files) objects.push({ name, ...await hashFile(path.join(sealed, name)) });
  return { prefix, objects };
}

function validateArchive(archive, prefix) {
  if (!archive || archive.prefix !== prefix || !Array.isArray(archive.objects) ||
      archive.objects.length < 4 || archive.objects.length > 100000) throw new Error("Invalid recovery archive");
  const names = new Set();
  for (const o of archive.objects) {
    if (!/^(objects\/[a-f0-9]{64}\.enc|recipient\.json|manifest\.enc|COMPLETE\.json)$/.test(o.name) ||
        names.has(o.name) || !/^[a-f0-9]{64}$/.test(o.sha256) ||
        !Number.isSafeInteger(o.bytes) || o.bytes < 1 || o.bytes > MAX_BYTES)
      throw new Error("Invalid recovery object");
    names.add(o.name);
  }
  for (const name of ["recipient.json", "manifest.enc", "COMPLETE.json"])
    if (!names.has(name)) throw new Error("Incomplete recovery archive");
}

export function validateDailyPair(pair, root = ROOT) {
  checkedRoot(root);
  if (!pair || pair.schema !== 1 || !/^\d{4}-\d{2}-\d{2}T/.test(pair.createdAt) ||
      !Number.isFinite(Date.parse(pair.createdAt))) throw new Error("Invalid recovery pair");
  const run = "[0-9TZ.:-]+-[a-f0-9-]{36}/";
  for (const kind of ["database", "portal"]) {
    const prefix = pair[kind]?.prefix;
    if (!new RegExp(`^${root}${kind === "portal" ? "portal/" : ""}${run}$`).test(prefix))
      throw new Error("Unexpected daily source");
    validateArchive(pair[kind], prefix);
  }
  if (!Number.isSafeInteger(pair.knownGaps) || pair.knownGaps < 0) throw new Error("Missing coverage status");
}

async function bytes(client, key, limit = MAX_BYTES) {
  const response = await client.send(new GetObjectCommand({ Bucket: BACKUP_BUCKET, Key: key }),
    { abortSignal: AbortSignal.timeout(120000) });
  const parts = []; let size = 0;
  for await (const chunk of response.Body) {
    size += chunk.length;
    if (size > limit) { response.Body.destroy?.(); throw new Error("Recovery object exceeds bound"); }
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

async function putVerified(client, key, data) {
  await client.send(new PutObjectCommand({ Bucket: BACKUP_BUCKET, Key: key, Body: data,
    ContentLength: data.length, ContentType: "application/octet-stream", Metadata: { sha256: sha256(data) } }),
  { abortSignal: AbortSignal.timeout(120000) });
  if (!data.equals(await bytes(client, key))) throw new Error("Recovery copy read-back mismatch");
}

async function checkedObject(client, prefix, object) {
  const data = await bytes(client, prefix + object.name);
  if (data.length !== object.bytes || sha256(data) !== object.sha256) throw new Error("Recovery object mismatch");
  return data;
}

function validateMonthly(receipt, month, root = ROOT) {
  checkedRoot(root);
  if (receipt?.schema !== 1 || receipt.month !== month ||
      !new RegExp(`^${root}monthly/${month}/[a-f0-9-]{36}/$`).test(receipt.prefix))
    throw new Error("Invalid monthly receipt");
  validateDailyPair(receipt.source, root);
  if (receipt.source.createdAt.slice(0, 7) !== month) throw new Error("Monthly date mismatch");
  for (const kind of ["database", "portal"])
    validateArchive(receipt[kind], receipt.prefix + kind + "/");
  for (const kind of ["database", "portal"])
    if (JSON.stringify(receipt[kind].objects) !== JSON.stringify(receipt.source[kind].objects))
      throw new Error("Monthly inventory mismatch");
}

// Never deletes or overwrites archive objects. Incomplete copies have no monthly
// marker; a subsequent run retries under a new prefix and preserves daily sources.
export async function preserveRecoverySet({ client, database, portal, now = new Date(), id = randomUUID(), root = ROOT }) {
  checkedRoot(root);
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid recovery set ID");
  const createdAt = now.toISOString(), month = createdAt.slice(0, 7);
  const pair = { schema: 1, createdAt, database, portal: { prefix: portal?.prefix, objects: portal?.objects },
    knownGaps: portal?.knownGaps, scope: "Sequential captures; not an atomic cross-provider snapshot. Historical gaps remain." };
  validateDailyPair(pair, root);
  await putVerified(client, `${root}pairs/${createdAt.replaceAll(":", "-")}-${id}.json`, Buffer.from(JSON.stringify(pair)));
  const marker = `${root}monthly/${month}/COMPLETE.json`;
  let existing;
  try { existing = JSON.parse((await bytes(client, marker, 8 * 1024 * 1024)).toString("utf8")); }
  catch (error) {
    if (error.name !== "NoSuchKey" && !(error.name === "NotFound" && error.$metadata?.httpStatusCode === 404)) throw error;
  }
  if (existing) {
    validateMonthly(existing, month, root);
    for (const kind of ["database", "portal"])
      for (const object of existing[kind].objects) await checkedObject(client, existing[kind].prefix, object);
    return { month, monthlyCreated: false, prefix: existing.prefix };
  }
  const prefix = `${root}monthly/${month}/${id}/`;
  const receipt = { schema: 1, month, prefix, source: pair };
  for (const kind of ["database", "portal"]) {
    receipt[kind] = { prefix: prefix + kind + "/", objects: pair[kind].objects };
    // COMPLETE is last in archiveReceipt; publish the paired month marker last.
    for (const object of pair[kind].objects)
      await putVerified(client, receipt[kind].prefix + object.name,
        await checkedObject(client, pair[kind].prefix, object));
  }
  await putVerified(client, marker, Buffer.from(JSON.stringify(receipt)));
  return { month, monthlyCreated: true, prefix };
}
