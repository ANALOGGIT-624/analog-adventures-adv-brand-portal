# Daily PostgreSQL backups — prepared, not enabled

## Deployment proposal

Create one Render Docker cron job in Ohio in the existing pilot environment:

- Name: `analog-portal-postgresql-backup`
- Repository: `ANALOGGIT-624/analog-adventures-adv-brand-portal`
- Branch: `codex/durable-hosting`
- Dockerfile: `Dockerfile.backup`
- Schedule: `0 8 * * *` (08:00 UTC daily, 04:00 Eastern daylight / 03:00 standard)
- Smallest suitable compute; auto-deploy Off; email failure notifications On.
- Render publishes a $1/month minimum, with active runtime billed separately
  above the minimum. Budget approval must specify a recurring limit before creation.

Existing app/database base cost is $14.50/month. The temporary recovery test's
one-time $1 approval does not authorize this recurring service.

## Required secrets, isolated to this job

- `DATABASE_URL`: existing private PostgreSQL endpoint, database
  `analog_portal_pilot`, TLS enabled. Use a dedicated read-only backup role when
  available; the existing owner credential is broader than necessary.
- `BACKUP_KEY_BASE64`: existing 32-byte recovery key in Base64. Requires owner
  approval to store it on Render; preserve independent Apple Passwords custody.
- `B2_ACCESS_KEY_ID` and `B2_SECRET_ACCESS_KEY`: new durable bucket/prefix-scoped
  identity for `analog-adventures-portal-backups`, prefix
  `recovery/postgresql/scheduled/`. Use custom capabilities to permit object
  upload/list/read without `deleteFiles`, `writeBuckets`, lifecycle changes,
  retention bypass or key administration. The dashboard's broad Read and Write
  preset is not the intended unattended identity. All temporary keys are revoked.
- `BACKUP_MONITOR_URL`: unique `https://hc-ping.com/<uuid>` endpoint for the
  free Healthchecks.io account. Configure daily 08:00 UTC with a one-hour grace
  period and email alerts. Only empty status pings are transmitted, never
  database records, errors or logs. Confirm email delivery with a controlled
  failure and recovery before relying on alerts.

Do not share this environment with the app. No credentials belong in Git,
Docker build arguments or image layers. The worker can decrypt its backups;
encryption does not protect against compromise of the worker itself.

## What each run does

The Node worker uses PostgreSQL 18 `pg_dump` to take a consistent custom-format
dump. It checks `pg_restore --list`, encrypts using the existing authenticated
archive format, and verifies local decryption. Every run has a unique timestamp
and random ID under the scheduled prefix. It uploads encrypted objects and the
manifest, downloads each to check its hash, and publishes COMPLETE last. It then
authenticates/decrypts the downloaded archive and checks dump readability again.
Only then does it send the monitor's success ping.

Failures return nonzero for Render's email alert. An independent daily monitor
detects a job that never starts or stops sending success. A 20-minute total
deadline bounds runtime. Temporary files are private and cleaned after normal
completion/failure; forced process termination relies on the job container's
ephemeral filesystem cleanup. There is no remote delete or retention pruning.

Each scheduled archive contains `database.dump` and scope metadata. The existing
offsite recovery toolkit includes `archive.mjs`; use `restoreDirectory` to
decrypt, then PostgreSQL 18 `pg_restore` into an empty isolated database.
Never launch an application with copied live session credentials during a drill.

## Acceptance gates

1. Approve recurring service cost and exact credential destinations.
2. Create limited durable credentials and configure the independent monitor.
3. Build the Docker image on Render (Docker is unavailable on the current Mac).
4. Trigger one job; verify B2 objects, hashes, decryption and monitor success.
5. Download that run independently and restore into isolated PostgreSQL;
   compare records and schema. Test failed-run and missing-run alerts.
6. Enable schedule and record the first scheduled success.

Unit tests exercise encrypted roundtrip, corrupt read-back preventing a
completion marker, configuration guards and empty monitor payloads. These do
not establish a deployed Docker job, real scheduled execution or email delivery.

## Scope limits

This backs up PostgreSQL sessions and checkout attempts only. Shopify proof,
request, production and payout metadata and R2 object bytes still need their
own unattended capture and durable-history design. Daily independent copies
provide up to a day of exposure if the entire primary provider becomes
unavailable; this does not satisfy the proposed 15-minute recovery-point target.
Keep Render's managed PITR and the already verified manual captures.

References checked September 29, 2026:

- https://render.com/docs/cronjobs
- https://render.com/docs/notifications
- https://healthchecks.io/pricing/
