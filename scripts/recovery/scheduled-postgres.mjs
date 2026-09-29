import process from "node:process";
import { randomUUID, randomBytes } from "node:crypto";
import { parseRecipient, wrapKey } from "./recipient.mjs";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { sealDirectory, restoreDirectory, hashFile } from "./archive.mjs";

// Deliberately do not print database errors, child stderr, keys or ping URLs.
export function configuration(env) {
  for (const name of ["DATABASE_URL", "BACKUP_PUBLIC_KEY_BASE64", "B2_ACCESS_KEY_ID", "B2_SECRET_ACCESS_KEY", "BACKUP_MONITOR_URL"])
    if (!env[name]) throw new Error("Required backup configuration missing");
  const database = new URL(env.DATABASE_URL);
  if (database.hostname !== "dpg-daql1l1srm7s73dfn2rg-a" && database.hostname !== "dpg-daql1l1srm7s73dfn2rg-a.ohio-postgres.render.com")
    throw new Error("Unexpected database host");
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || database.pathname !== "/analog_portal_pilot")
    throw new Error("Unexpected database identity");
  if (!['require', 'verify-full'].includes(database.searchParams.get("sslmode")))
    throw new Error("Database TLS required");
  const recipient = parseRecipient(env.BACKUP_PUBLIC_KEY_BASE64);
  const monitor = new URL(env.BACKUP_MONITOR_URL);
  if (monitor.protocol !== "https:" || monitor.hostname !== "hc-ping.com" || monitor.username || monitor.password || monitor.search || monitor.hash || !/^\/[0-9a-f-]{36}$/.test(monitor.pathname))
    throw new Error("Unexpected monitoring endpoint");
  return { database: database.href, recipient, monitor: monitor.href };
}

async function command(program, args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(program, args, { env, stdio: ["ignore", "ignore", "pipe"] });
    let diagnostic = "";
    child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-8192); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 10 * 60 * 1000);
    child.once("error", () => { clearTimeout(timer); reject(new Error("Backup command failed")); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      // Emit only fixed categories; database tools can include credentials in stderr.
      const category = /does not support SSL/i.test(diagnostic) ? "tls-unavailable"
        : /password authentication failed/i.test(diagnostic) ? "authentication"
        : /could not translate host name/i.test(diagnostic) ? "dns"
        : /server version mismatch/i.test(diagnostic) ? "version-mismatch"
        : /permission denied/i.test(diagnostic) ? "permission"
        : /could not connect|connection.*failed|Connection refused/i.test(diagnostic) ? "connection"
        : "other";
      console.error(JSON.stringify({ commandFailed: program, category }));
      reject(new Error("Backup command failed"));
    });
  });
}

export async function ping(url, suffix = "", fetcher = fetch) {
  const response = await fetcher(url + suffix, { method: "POST", body: "", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Backup monitor unavailable");
}

// Caller creates a unique run prefix. Never delete remote backups or prune versions.
export async function transferVerified({ client, bucket, prefix, sealed, download }) {
  await mkdir(download, { mode: 0o700 });
  const objects = (await readdir(path.join(sealed, "objects"))).sort();
  if (objects.some(name => !/^[a-f0-9]{64}\.enc$/.test(name))) throw new Error("Unexpected archive object");
  const files = [...objects.map(name => `objects/${name}`), "recipient.json", "manifest.enc", "COMPLETE.json"];
  for (const relative of files) {
    const source = path.join(sealed, relative);
    const expected = await hashFile(source);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: prefix + relative,
      Body: createReadStream(source), ContentLength: expected.bytes, ContentType: "application/octet-stream",
      Metadata: { sha256: expected.sha256 } }), { abortSignal: AbortSignal.timeout(120000) });
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: prefix + relative }), { abortSignal: AbortSignal.timeout(120000) });
    const target = path.join(download, relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await pipeline(response.Body, createWriteStream(target, { flags: "wx", mode: 0o600 }), { signal: AbortSignal.timeout(120000) });
    const actual = await hashFile(target);
    if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) throw new Error("Offsite read-back mismatch");
  }
  return files.length;
}

export async function runBackup(env = process.env) {
  process.umask(0o077);
  const config = configuration(env);
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-pg-backup-"));
  const bucket = "analog-adventures-portal-backups";
  const prefix = `recovery/postgresql/scheduled/${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}/`;
  const client = new S3Client({ region: "us-east-005", endpoint: "https://s3.us-east-005.backblazeb2.com",
    credentials: { accessKeyId: env.B2_ACCESS_KEY_ID, secretAccessKey: env.B2_SECRET_ACCESS_KEY }, maxAttempts: 3 });
  try {
    console.log("Backup stage: monitor-start");
    await ping(config.monitor, "/start");
    const keyFile = path.join(root, "key"), source = path.join(root, "source");
    const runKey = randomBytes(32);
    const envelope = wrapKey(runKey, config.recipient);
    await writeFile(keyFile, runKey, { mode: 0o600, flag: "wx" });
    runKey.fill(0);
    await mkdir(source, { mode: 0o700 });
    // Connection and encryption secrets are excluded from command arguments/logs.
    const childEnv = { PATH: env.PATH, PGDATABASE: config.database, PGCONNECT_TIMEOUT: "30" };
    const dump = path.join(source, "database.dump");
    console.log("Backup stage: database-export");
    await command("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--lock-wait-timeout=60000", "--file", dump], childEnv);
    if ((await stat(dump)).size === 0) throw new Error("Empty database export");
    await command("pg_restore", ["--list", dump], childEnv);
    await writeFile(path.join(source, "scope.json"), JSON.stringify({
      capturedAt: new Date().toISOString(), database: "analog_portal_pilot", format: "PostgreSQL custom dump",
      scope: "PostgreSQL only. Shopify business metadata and R2 objects are not included.",
      verification: "Encrypted read-back and dump readability; scheduled runs do not restore a running database.",
    }), { mode: 0o600 });
    await sealDirectory(source, path.join(root, "sealed"), keyFile, { kind: "scheduled-postgresql", database: "analog_portal_pilot" });
    await writeFile(path.join(root, "sealed", "recipient.json"), JSON.stringify(envelope), { mode: 0o600, flag: "wx" });
    await restoreDirectory(path.join(root, "sealed"), path.join(root, "local-verified"), keyFile);
    console.log("Backup stage: offsite-transfer");
    const objectCount = await transferVerified({ client, bucket, prefix, sealed: path.join(root, "sealed"), download: path.join(root, "download") });
    await restoreDirectory(path.join(root, "download"), path.join(root, "verified"), keyFile);
    await command("pg_restore", ["--list", path.join(root, "verified", "database.dump")], childEnv);
    // Success is signaled only after remote read-back, authenticated decryption and dump check.
    await ping(config.monitor);
    console.log(JSON.stringify({ backupVerified: true, bucket, prefix, objects: objectCount }));
  } catch {
    await ping(config.monitor, "/fail").catch(() => {});
    throw new Error("Backup failed; details suppressed to protect credentials");
  } finally {
    client.destroy();
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Bound total runtime even if a network or child process stalls. Render failure
  // alerts plus the independent missing-success monitor cover forced termination.
  const deadline = setTimeout(() => { console.error("Backup exceeded 20-minute runtime limit"); process.exit(1); }, 20 * 60 * 1000);
  try { await runBackup(); } catch { console.error("Scheduled backup failed; no credentials logged"); process.exitCode = 1; }
  finally { clearTimeout(deadline); }
}
