import process from "node:process";
import { runBackup, ping } from "./scheduled-postgres.mjs";
import { runBackupJob } from "./job-lifecycle.mjs";
import { S3Client } from "@aws-sdk/client-s3";
import { preserveRecoverySet } from "./recovery-sets.mjs";

let database;

// A portal failure must not prevent the independently verified database backup.
await runBackupJob({
  database: async () => { database = await runBackup(); },
  portal: process.env.BACKUP_PORTAL_ENABLED === "1" ? async () => {
    const { runPortalBackup } = await import("./scheduled-portal.mjs");
    const portal = await runPortalBackup();
    if (process.env.BACKUP_MONTHLY_ENABLED !== "1") return;
    const client = new S3Client({ region: "us-east-005", endpoint: "https://s3.us-east-005.backblazeb2.com",
      credentials: { accessKeyId: process.env.B2_ACCESS_KEY_ID, secretAccessKey: process.env.B2_SECRET_ACCESS_KEY }, maxAttempts: 3 });
    try {
      await ping(process.env.PORTAL_BACKUP_MONITOR_URL, "/start");
      const result = await preserveRecoverySet({ client, database, portal });
      await ping(process.env.PORTAL_BACKUP_MONITOR_URL);
      console.log(JSON.stringify({ recoverySetVerified: true, ...result }));
    } catch {
      await ping(process.env.PORTAL_BACKUP_MONITOR_URL, "/fail").catch(() => {});
      throw new Error("Recovery set verification failed");
    } finally { client.destroy(); }
  } : undefined,
});
