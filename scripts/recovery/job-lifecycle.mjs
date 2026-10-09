import process from "node:process";

// Only awaited tasks may determine success. Exit explicitly after cleanup so
// SDK keep-alive resources cannot turn a completed cron job into a running one.
export async function runBackupJob({ database, portal, finish = code => process.exit(code), timeoutMs = 20 * 60 * 1000 }) {
  const deadline = setTimeout(() => {
    console.error("Backup job exceeded runtime limit");
    finish(1);
  }, timeoutMs);
  let code = 0;
  try {
    for (const [stage, task] of [["database", database], ["portal", portal]]) {
      if (!task) continue;
      try {
        await task();
        console.log(JSON.stringify({ backupStageComplete: stage }));
      } catch {
        code = 1;
        console.error(JSON.stringify({ backupStageFailed: stage }));
      }
    }
    console.log(JSON.stringify({ backupJobComplete: true, exitCode: code }));
    // Flush the final status before explicit exit; the deadline also bounds flush.
    await Promise.all([process.stdout, process.stderr].map(stream =>
      new Promise(resolve => stream.write("", resolve))));
    finish(code);
  } finally {
    clearTimeout(deadline);
  }
}
