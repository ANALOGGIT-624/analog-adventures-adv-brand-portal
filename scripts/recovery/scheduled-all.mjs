import process from "node:process";
import { runBackup } from "./scheduled-postgres.mjs";

// Separate archives and monitor signals: portal access failure must not prevent
// the independently verified PostgreSQL backup from running.
const deadline = setTimeout(() => { console.error("Backup job exceeded 20-minute limit"); process.exit(1); }, 20 * 60 * 1000);
try {
  try { await runBackup(); } catch { console.error("PostgreSQL backup failed; credentials suppressed"); process.exitCode = 1; }
  if (process.env.BACKUP_PORTAL_ENABLED === "1") {
    try {
      const { runPortalBackup } = await import("./scheduled-portal.mjs");
      await runPortalBackup();
    } catch { console.error("Portal backup failed; credentials suppressed"); process.exitCode = 1; }
  }
} finally { clearTimeout(deadline); }
