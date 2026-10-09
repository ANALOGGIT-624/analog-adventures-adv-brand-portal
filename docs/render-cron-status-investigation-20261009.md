# Render cron completion discrepancy — October 9, 2026

Sent through Render dashboard support on October 9, 2026, with user authorization.
Submission included a fresh observation that the run remained In progress at 37m10s.

Please investigate a cron run that remains In progress after the application
completed both backup stages and cleanup. We need to establish whether the
container is still running, whether its exit status was received, or whether
control-plane status/log reporting is delayed.

- Service: `crn-datuduek1f9s739mlisg` (Ohio), `analog-portal-postgresql-backup`.
- Build: `bld-db4ib3l9fdbs73fcuprg`, commit `a72d719`.
- Manual trigger approximately 17:35 UTC on October 9.
- Database backup verified and cleanup returned at 17:35:52 UTC.
- Portal backup verified and cleanup returned at 17:37:01 UTC.
- Worker logged `{"backupJobComplete":true,"exitCode":0}` at 17:37:01 UTC.
- Render logged `Cron job run started` at 17:39:24 UTC, after those logs.
- The Runs page subsequently showed In progress for 20m38s. Its log link was
  `/cron/crn-datuduek1f9s739mlisg/logs?r=2026-10-09%4017%3A34%3A14%7E2026-10-09%4017%3A56%3A50`.
- Docker command override is empty; Dockerfile uses ENTRYPOINT node and CMD
  scripts/recovery/scheduled-all.mjs. No wrapper server is configured.

The completion message occurs immediately before flushing stdout/stderr and
calling process.exit(code); it is evidence of completed tasks, not direct proof
that process.exit executed. A 20-minute timeout remains armed through the flush.
No timeout message was observed. Subprocess tests verify exit with lingering
timers, failure exit codes, cleanup failure and timeout; 204 tests passed overall.

An earlier run eventually received Render's successful completion event at
17:34:19 UTC after the archive verification log at 17:28:06 UTC. We do not know
whether that delay and this run's discrepancy share a cause.

Please provide the actual run/container ID, process exit code and termination
time, and check for delayed/stale scheduler events. Please preserve the existing
service, schedule, environment and backup data; do not trigger or cancel runs
without coordinating with us. No credentials or customer records are included.


Render's automated assistant acknowledged the report. A follow-up requested
human investigation and clarified that the completion log precedes output flush
and process.exit, with no subsequent asynchronous cleanup. Render confirmed
escalation to its team and said replies will arrive in dashboard chat and email.
No ticket number was displayed. No cancellation or service change was requested.
