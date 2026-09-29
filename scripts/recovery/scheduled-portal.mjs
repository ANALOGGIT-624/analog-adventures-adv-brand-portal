import process from "node:process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Buffer } from "node:buffer";
import { S3Client } from "@aws-sdk/client-s3";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { capture } from "./capture.mjs";
import { createPortalReader, BACKUP_STORE } from "./portal-client.mjs";
import { privateArtworkConfig } from "../../app/lib/private-artwork-storage.server.js";
import { configuration, transferVerified, ping } from "./scheduled-postgres.mjs";
import { parseRecipient, wrapKey } from "./recipient.mjs";
import { sealDirectory, restoreDirectory } from "./archive.mjs";

const normalized = gap => JSON.stringify(Object.fromEntries(Object.entries(gap).filter(([k]) => k !== "detail").sort(([a], [b]) => a.localeCompare(b))));
export function assessPortalCoverage(report, baseline) {
  if (!baseline || baseline.store !== BACKUP_STORE || !Array.isArray(baseline.acceptedGaps) || !baseline.minimumCounts)
    throw new Error("Portal backup scope baseline required");
  const accepted = new Set(baseline.acceptedGaps.map(normalized));
  const unexpectedGaps = report.gaps.filter(g => !accepted.has(normalized(g)));
  const countRegressions = Object.entries(baseline.minimumCounts).filter(([name, minimum]) =>
    !Number.isSafeInteger(minimum) || minimum < 0 || !Number.isSafeInteger(report.counts[name]) || report.counts[name] < minimum).map(([name]) => name);
  return { healthy: report.status !== "capture_failed" && !unexpectedGaps.length && !countRegressions.length,
    knownGaps: report.gaps.length - unexpectedGaps.length, unexpectedGaps: unexpectedGaps.length, countRegressions };
}

export async function runPortalBackup(env = process.env) {
  process.umask(0o077);
  const portalEnv = { ...env, BACKUP_MONITOR_URL: env.PORTAL_BACKUP_MONITOR_URL };
  configuration(portalEnv); // Includes the same source database and monitor guards.
  if (env.ARTWORK_R2_ACCOUNT_ID !== "6da62e9e9b3c4aac0de6d4d867b78dcf" ||
      env.ARTWORK_R2_BUCKET !== "analog-brand-portal-private")
    throw new Error("Unexpected portal artwork backup source");
  const recipient = parseRecipient(env.BACKUP_PUBLIC_KEY_BASE64);
  const baseline = JSON.parse(Buffer.from(env.PORTAL_BACKUP_BASELINE_BASE64 || "", "base64").toString("utf8"));
  assessPortalCoverage({ status: "captured", gaps: [], counts: baseline.minimumCounts }, baseline);
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-business-backup-"));
  const bucket = "analog-adventures-portal-backups";
  // Separate subtree and separate monitor, within the existing scheduled identity.
  const prefix = `recovery/postgresql/scheduled/portal/${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}/`;
  const client = new S3Client({ region: "us-east-005", endpoint: "https://s3.us-east-005.backblazeb2.com",
    credentials: { accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY }, maxAttempts: 3 });
  let prisma;
  try {
    await ping(env.PORTAL_BACKUP_MONITOR_URL, "/start");
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } }, log: [] });
    await prisma.$connect();
    const queryExecutor = await createPortalReader(env, new PrismaSessionStorage(prisma));
    const runKey = randomBytes(32), envelope = wrapKey(runKey, recipient), keyFile = path.join(root, "key");
    await writeFile(keyFile, runKey, { mode: 0o600, flag: "wx" }); runKey.fill(0);
    const captureRoot = path.join(root, "portal");
    const report = await capture({ store: BACKUP_STORE, output: captureRoot, keyFile, queryExecutor,
      includeRepositoryHistory: false, seal: false, artworkConfig: privateArtworkConfig(env) });
    const coverage = assessPortalCoverage(report, baseline);
    await writeFile(path.join(captureRoot, "capture", "coverage.json"), JSON.stringify({ ...coverage,
      scope: "Current accessible portal data only; accepted historical gaps remain unresolved.", baseline }), { mode: 0o600, flag: "wx" });
    const sealed = path.join(root, "sealed");
    await sealDirectory(path.join(captureRoot, "capture"), sealed, keyFile, { kind: "scheduled-portal", store: BACKUP_STORE, status: report.status });
    await writeFile(path.join(sealed, "recipient.json"), JSON.stringify(envelope), { mode: 0o600, flag: "wx" });
    const download = path.join(root, "download");
    const objects = await transferVerified({ client, bucket, prefix, sealed, download });
    const restored = path.join(root, "verified");
    await restoreDirectory(download, restored, keyFile);
    const recoveredReport = JSON.parse(await readFile(path.join(restored, "capture-report.json"), "utf8"));
    if (JSON.stringify(recoveredReport) !== JSON.stringify(report)) throw new Error("Portal report read-back mismatch");
    if (!coverage.healthy) throw new Error("Portal capture has new coverage gaps");
    await ping(env.PORTAL_BACKUP_MONITOR_URL);
    console.log(JSON.stringify({ portalBackupVerified: true, bucket, prefix, objects, counts: report.counts, knownGaps: coverage.knownGaps }));
  } catch {
    await ping(env.PORTAL_BACKUP_MONITOR_URL, "/fail").catch(() => {});
    throw new Error("Portal backup failed; credentials suppressed");
  } finally {
    await prisma?.$disconnect(); client.destroy(); await rm(root, { recursive: true, force: true });
  }
}
