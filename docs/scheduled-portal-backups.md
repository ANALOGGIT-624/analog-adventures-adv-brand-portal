# Scheduled Shopify and artwork backups

The existing Render backup job is being extended to capture the test store's accessible portal records, orders/refunds, companies, draft orders, Shopify file metadata and downloadable assets, plus the private R2 bucket. PostgreSQL keeps its independent archive and monitor. No additional Render service is needed.

## Approved scope, September 29, 2026

The owner approved storing the existing Shopify app credential and a dedicated R2 read-only credential in the backup job's private environment, and encrypted exports in the existing Backblaze bucket. The R2 key permits only reading/listing `analog-brand-portal-private`, and expires December 28, 2026. The Shopify credential retains the application's permissions; the worker exposes only named read queries and uses Shopify's SDK to refresh the database's offline session.

The owner accepted a limited monitoring baseline: 29 metaobjects, 9 orders, 4 companies, 15 draft orders, 32 Shopify file records, 31 downloaded assets, and zero R2 objects. Twelve known coverage gaps remain recorded in every encrypted capture: restricted historical order access, definition/count discrepancies, inaccessible historical records, and one external video with no downloadable original. Missing proof, batch, request, and delivery history is unresolved. A green capture does not clear the pilot or demonstrate complete historical recovery.

`PORTAL_BACKUP_BASELINE_BASE64` contains the explicitly accepted gaps and minimum counts. New gaps, counts below those minimums, and capture failures fail the portal monitor. These static minimums do not detect every deletion when counts remain above the baseline. Captures across services are not atomic snapshots.

## Implementation and recovery

`scheduled-all.mjs` runs the existing PostgreSQL backup then, when `BACKUP_PORTAL_ENABLED=1`, the portal backup. Each has a separate Healthchecks monitor. Both use the existing daily 08:00 UTC schedule and a shared twenty-minute deadline. Portal archives use `recovery/postgresql/scheduled/portal/` within the existing Backblaze credential's restricted prefix.

The job generates a temporary symmetric key per archive, encrypts files, and wraps that key with the recovery public key. Only the public key is stored on Render. Uploads are read back, hashes and decryption checked, and a completion marker published. Partial captures are preserved but do not generate a success heartbeat unless they meet the approved baseline. Logs suppress credentials and business contents.

To independently verify recovery, download a completed archive, use `restoreRecipient` with the separately recovered private key, then call `verifyRestoredPortal` to build the offline catalog and validate counts and the payout checkpoint. This verifies an offline export; it does not import business records into Shopify. PostgreSQL is restored from its separate archive.

## Validation and rollout

Local API capture and offline catalog recovery passed for the approved baseline. Nineteen focused tests cover encrypted restoration, tampering, pagination, public-key recovery, monitored transfer, reader restrictions, R2 byte integrity/concurrent changes, and coverage regressions.

Render built worker commit `c3c604d` successfully. The first combined manual run finished September 29 at 17:20 UTC. PostgreSQL independently verified its five-object archive. The portal capture uploaded and read back 127 encrypted objects at `recovery/postgresql/scheduled/portal/2026-09-29T17-19-09.064Z-3f38a16e-b3ea-409e-ba0e-28d9783835ba/`. Its separate Healthchecks monitor is up, daily 08:00 UTC with one-hour grace and email enabled.

An independent download on the Mac checked every encrypted object's hash, then decrypted 124 files using the private key recovered from offsite escrow. The restored catalog contains 29 records, 9 orders, and 31 assets. The TTW-MULTI payout checkpoint matches September 21. All twelve accepted gaps remain visible. Evidence is stored privately in `recovery-private/portal-scheduled-first-restored/OFFSITE-RESTORE-VERIFIED.json` alongside the transfer verification record in the download directory.

The first automatic run is due September 30 at 08:00 UTC and has not yet been observed. Because the private R2 bucket is empty, this run verifies read/list access and empty inventory; nonempty R2 recovery is covered only by synthetic byte-integrity tests. The separate `analog-adventure-uploads` bucket is outside this portal backup's scope.

Existing application R2 upload key expires October 24, 2026; the new backup credential does not renew that separate key. The scheduled Backblaze credential expires December 28, 2026. No immutable retention policy has been enabled.
