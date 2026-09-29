# Daily PostgreSQL backups — deployed September 29, 2026

## Deployment configuration

One Render Docker cron job is deployed in Ohio in the existing pilot environment:

- Name: `analog-portal-postgresql-backup`
- Repository: `ANALOGGIT-624/analog-adventures-adv-brand-portal`
- Branch: `codex/durable-hosting`
- Dockerfile: `Dockerfile.backup`
- Schedule: `0 8 * * *` (08:00 UTC daily, 04:00 Eastern daylight / 03:00 standard)
- Smallest suitable compute; auto-deploy Off; email failure notifications On.
- Render publishes a $1/month minimum, with active runtime billed separately
  above the minimum. Owner approved a recurring budget of up to $2/month on September 29.

Existing app/database base cost is $14.50/month. This is separate from the completed temporary recovery test.

## Required secrets, isolated to this job

- `DATABASE_URL`: existing private PostgreSQL endpoint, database
  `analog_portal_pilot`, TLS enabled. Use a dedicated read-only backup role when
  available; the existing owner credential is broader than necessary.
- `BACKUP_PUBLIC_KEY_BASE64`: Base64-encoded RSA-3072 public PEM key only.
  Never put the private recipient key or original Apple Passwords recovery key
  on Render. Each run generates a temporary random AES-256 key and wraps it
  with RSA-OAEP-SHA256 in `recipient.json`. The temporary key is removed after
  verification; it is not a persistent Render secret.
- `B2_ACCESS_KEY_ID` and `B2_SECRET_ACCESS_KEY`: new durable bucket/prefix-scoped
  identity for `analog-adventures-portal-backups`, prefix
  `recovery/postgresql/scheduled/`. The owner explicitly approved the dashboard Read and Write preset on
  September 29 after disclosure that it includes `deleteFiles`, `writeBuckets`
  and bucket-setting changes. File operations are prefix-scoped; bucket-setting
  permissions are broader. This is not a non-deleting identity. The key expires
  December 28, 2026 at 11:20 Eastern and must be rotated before expiry.
  All earlier temporary keys are revoked. A custom upload/read-only-capability
  identity remains a future hardening improvement.
- `BACKUP_MONITOR_URL`: unique `https://hc-ping.com/<uuid>` endpoint for the
  free Healthchecks.io account. Configure daily 08:00 UTC with a one-hour grace
  period and email alerts. Only empty status pings are transmitted, never
  database records, errors or logs. Confirm email delivery with a controlled
  failure and recovery before relying on alerts.

Do not share this environment with the app. No credentials belong in Git,
Docker build arguments or image layers. The worker can decrypt the current run while its temporary key exists. It
cannot decrypt previous runs using its persisted public key. A compromised
worker can still read the source database and future dumps; this is not
protection against compromise of the live database credential.

## What each run does

The Node worker uses PostgreSQL 18 `pg_dump` to take a consistent custom-format
dump. It checks `pg_restore --list`, encrypts using the existing authenticated
archive format, and verifies local decryption. Every run has a unique timestamp
and random ID under the scheduled prefix. It uploads encrypted objects and the
manifest, downloads each to check its hash, and the wrapped-key envelope, and publishes COMPLETE last. It then
authenticates/decrypts the downloaded archive and checks dump readability again.
Only then does it send the monitor's success ping.

Failures return nonzero for Render's email alert. An independent daily monitor
detects a job that never starts or stops sending success. A 20-minute total
deadline bounds runtime. Temporary files are private and cleaned after normal
completion/failure; forced process termination relies on the job container's
ephemeral filesystem cleanup. There is no remote delete or retention pruning.

Each scheduled archive contains `database.dump` and scope metadata. The matching recovery toolkit must include `archive.mjs`, `recipient.mjs` and
`restore-recipient.mjs`. First recover private.pem from the separately encrypted
recipient escrow with the original 32-byte recovery key held in Apple Passwords.
Then run `node scripts/recovery/restore-recipient.mjs SEALED_DIR PRIVATE_PEM NEW_DEST`
and PostgreSQL 18 `pg_restore` into an empty isolated database. The old symmetric
backups keep their original recovery procedure. Do not enable scheduled backups
until the encrypted private-key escrow is independently stored and recovered.
Never launch an application with copied live session credentials during a drill.

## Acceptance evidence and remaining checks

- Render job `crn-datuduek1f9s739mlisg`, deployed worker commit `0895b80`.
- First successful manual run: September 29, 16:38 UTC, five encrypted objects
  under `recovery/postgresql/scheduled/2026-09-29T16-38-40.517Z-aa9331a6-4265-4da5-8491-50be8d268248/`.
- Independently downloaded all five objects, verified SHA256 metadata, decrypted
  with a private key recovered from the separately downloaded escrow bundle,
  and restored into isolated PostgreSQL 18. All fields matched the live
  read-only snapshot: Session 1, BulkCheckoutAttempt 4, migration 1; schema matched.
- Render failure emails and Healthchecks failure/recovery emails reached the
  owner’s Gmail inbox. A fresh heartbeat followed by a one-minute test cron
  and one-minute grace period generated a missed-success email at 16:45 UTC.
  The monitor was restored to daily 08:00 UTC with one-hour grace afterward.
- First automatic 08:00 UTC run remains a future observation, not yet verified.
- Recovery test database was stopped; no temporary Render database remains.

### Deployment checklist

1. Approve recurring service cost and exact credential destinations.
2. Create bucket/prefix-scoped durable credentials and configure the independent monitor.
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
