# Durable hosting preparation

Status: prepared locally, not provisioned or deployed. Keep the existing SQLite
checkout and verified Backblaze capture intact. The PostgreSQL profile covers
Session and BulkCheckoutAttempt only; it does not independently preserve
Shopify proof, request, production or payout metadata yet.

## Proposed pilot service

Use one paid Render web service and one paid Render PostgreSQL database in the
same region, initially on a Hobby workspace. The published small-app example is
about $13/month before database storage and usage. Plan for roughly $15–$20/month
at small pilot usage; confirm the actual dashboard estimate and user budget
before creating paid services. Extra restore instances, scheduled workers,
bandwidth and storage can add cost. No service has been purchased.

Render documents three days of PITR on Hobby with paid PostgreSQL compute;
Pro and higher offer seven days. Free database compute has no managed recovery.
Restores create a separate database and cannot target the most recent ten
minutes. These features alone do not establish our proposed RPO/RTO targets.

## Separate database profile

Local development keeps `prisma/schema.prisma` and its existing SQLite history.
`prisma-postgresql/schema.prisma` mirrors the two application models with a
DATABASE_URL connection and a separate initial PostgreSQL migration. Do not run
SQLite migrations against PostgreSQL or replace/reset the current database.
Keep both model definitions aligned until the permanent development DB policy
is decided. PostgreSQL profile commands:

```sh
npx prisma validate --schema prisma-postgresql/schema.prisma
npx prisma generate --schema prisma-postgresql/schema.prisma
npx prisma migrate deploy --schema prisma-postgresql/schema.prisma
```

Generation replaces the shared generated client in that checkout. Run the
PostgreSQL profile in its own build/container. Do not run the default `setup` or
`docker-start` for PostgreSQL: they target SQLite. `Dockerfile.postgresql`
generates the correct client and starts the server without automatic migration.
Run the migration as a separate reviewed release command before routing traffic.

The Docker ignore rules exclude environment credentials, Shopify CLI state,
local databases and recovery keys. Secrets belong in the host's secret settings,
not in Docker build arguments, image layers, Git or logs.

## Cutover gates and order

1. Confirm account, region, exact monthly cost, MFA and billing with the owner.
2. Create isolated pilot app/database resources. Limit DB access to the app and
   authorized recovery operator; use TLS and managed secret injection.
3. Validate the migration against a disposable real PostgreSQL instance. No
   PostgreSQL server or Docker runtime is available on this Mac at preparation
   time, so SQL generation/validation is not a database integration test.
4. Implement and test a transactional SQLite-to-PostgreSQL import into an empty
   target. Preserve IDs, dates, BigInt user IDs, checkout snapshots and nullable
   fields. Never replay Shopify orders/refunds/payments. Compare every record,
   not just counts, and refuse a populated target. Existing source stays intact.
5. Add durable portal history and an outbox/reconciliation design for Shopify
   writes. Record immutable successful proof/production/payout snapshots and
   handle uncertain remote outcomes. Merely moving sessions to PostgreSQL does
   not solve the historical metadata problem.
6. Add unattended PostgreSQL dumps and complete portal/R2 capture, encrypt,
   upload to B2 with non-delete credentials, verify read-back and restore. The
   current capture uses local Shopify CLI login and SQLite and is not ready for
   a hosted unattended schedule. The current B2 transfer key expires in 24 hours
   and is not a long-term backup identity. Add failed/missing-backup alerts and
   explicit incomplete-capture reporting before relying on automation.
7. Perform PITR and independent B2 operational restores into isolated resources;
   prevent outbound business mutations/webhooks during restore testing. Measure
   recovery time and verify immutable history plus checkout idempotency.
8. Freeze writes, take a fresh verified capture, import the final delta and
   deploy the pilot server. Verify health, restart/redeploy persistence,
   authentication, private artwork and tenant isolation. Only then release the
   matching Shopify URLs/extensions/definitions. Never run `app dev clean`.
9. Preserve old storage and backups through acceptance. Before any rollback
   after new writes, reconcile those writes; pointing back to stale SQLite would
   lose them. A restore is always into an empty isolated target first.

Pilot remains gated on unresolved historical gaps or an explicitly accepted
synthetic baseline. Offsite key custody is confirmed, but MFA, retention locks,
automatic backups and operational recovery remain outstanding.

## References checked September 24, 2026

- https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses
- https://render.com/docs/postgresql-backups
- https://render.com/docs/deploy-shopify-app
- https://render.com/pricing

## September 24 import verification

The new Ohio Render database passed migration application and live schema diff.
A fresh SQLite backup snapshot passed integrity checking. The import tool in
`scripts/migration/import-sqlite.mjs` rehearsed 1 Session and 4
BulkCheckoutAttempt rows in a serializable transaction, verified all fields,
and rolled back. The committed run then verified all fields again outside the
transaction. A repeated import refused the populated target before writing.
Original SQLite remains intact. This is a test-store database copy, not a live
traffic cutover or recovery of missing Shopify history.

The tool takes independently generated SQLite/PostgreSQL client paths, an
immutable SQLite source snapshot, expected target hostname and expected shop.
It requires TLS, locks both target tables before checking emptiness, and defaults
to rollback. `--commit` enables the verified transactional import. Credentials
are supplied through DATABASE_URL from an ignored owner-only environment file.
Generated clients must be separate from the app's existing generated client.
Keep app writes paused during snapshot/import and until traffic cutover; if
writes resume, reconcile a fresh snapshot rather than silently reusing this copy.
