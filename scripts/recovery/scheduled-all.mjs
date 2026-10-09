import process from "node:process";
import { runBackup } from "./scheduled-postgres.mjs";
import { runBackupJob } from "./job-lifecycle.mjs";

// A portal failure must not prevent the independently verified database backup.
await runBackupJob({
  database: runBackup,
  portal: process.env.BACKUP_PORTAL_ENABLED === "1" ? async () => {
    const { runPortalBackup } = await import("./scheduled-portal.mjs");
    await runPortalBackup();
  } : undefined,
});
