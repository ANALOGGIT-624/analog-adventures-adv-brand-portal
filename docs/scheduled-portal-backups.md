# Scheduled Shopify and artwork backups

The existing Render backup job is being extended to capture the test store's accessible portal records, orders/refunds, companies, draft orders, Shopify file metadata and downloadable assets, plus the private R2 bucket. PostgreSQL keeps its independent archive and monitor. No additional Render service is needed.

## Approved scope, September 29, 2026

The owner approved storing the existing Shopify app credential and a dedicated R2 read-only credential in the backup job's private environment, and encrypted exports in the existing Backblaze bucket. The R2 key permits only reading/listing `analog-brand-portal-private`, and expires December 28, 2026. The Shopify credential retains the application's permissions; the worker exposes only named read queries and uses Shopify's SDK to refresh the database's offline session.

The owner accepted a limited monitoring baseline: 29 metaobjects, 9 orders, 4 companies, 15 draft orders, 32 Shopify file records, 31 downloaded assets, and zero R2 objects. Twelve known coverage gaps remain recorded in every encrypted capture: restricted historical order access, definition/count discrepancies, inaccessible historical records, and one external video with no downloadable original. Missing proof, batch, request, and delivery history is unresolved. A green capture does not clear the pilot or demonstrate complete historical recovery.

`PORTAL_BACKUP_BASELINE_BASE64` contains the explicitly accepted gaps and minimum counts. New gaps, counts below those minimums, and capture failures fail the portal monitor. These static minimums do not detect every deletion when counts remain above the baseline. Captures across services are not atomic snapshots.

After changing the baseline, rebuild the Render cron worker before considering the scheduled configuration updated. A saved environment value and a successful manually triggered run are insufficient evidence: the October 1 scheduled run retained the September 29 baseline despite the September 30 manual runs using the saved changes. Verify the deployed build and the actual baseline inside a newly downloaded archive. Render documents that saved-only environment changes do not take effect until deployment: https://render.com/docs/configure-environment-variables.

## Implementation and recovery

`scheduled-all.mjs` runs the existing PostgreSQL backup then, when `BACKUP_PORTAL_ENABLED=1`, the portal backup. Each has a separate Healthchecks monitor. Both use the existing daily 08:00 UTC schedule and a shared twenty-minute deadline. Portal archives use `recovery/postgresql/scheduled/portal/` within the existing Backblaze credential's restricted prefix.

The job generates a temporary symmetric key per archive, encrypts files, and wraps that key with the recovery public key. Only the public key is stored on Render. Uploads are read back, hashes and decryption checked, and a completion marker published. Partial captures are preserved but do not generate a success heartbeat unless they meet the approved baseline. Logs suppress credentials and business contents.

To independently verify recovery, download a completed archive, use `restoreRecipient` with the separately recovered private key, then call `verifyRestoredPortal` to build the offline catalog and validate counts and the payout checkpoint. This verifies an offline export; it does not import business records into Shopify. PostgreSQL is restored from its separate archive.

## Validation and rollout

Local API capture and offline catalog recovery passed for the approved baseline. Nineteen focused tests cover encrypted restoration, tampering, pagination, public-key recovery, monitored transfer, reader restrictions, R2 byte integrity/concurrent changes, and coverage regressions.

Render built worker commit `c3c604d` successfully. The first combined manual run finished September 29 at 17:20 UTC. PostgreSQL independently verified its five-object archive. The portal capture uploaded and read back 127 encrypted objects at `recovery/postgresql/scheduled/portal/2026-09-29T17-19-09.064Z-3f38a16e-b3ea-409e-ba0e-28d9783835ba/`. Its separate Healthchecks monitor is up, daily 08:00 UTC with one-hour grace and email enabled.

An independent download on the Mac checked every encrypted object's hash, then decrypted 124 files using the private key recovered from offsite escrow. The restored catalog contains 29 records, 9 orders, and 31 assets. The TTW-MULTI payout checkpoint matches September 21. All twelve accepted gaps remain visible. Evidence is stored privately in `recovery-private/portal-scheduled-first-restored/OFFSITE-RESTORE-VERIFIED.json` alongside the transfer verification record in the download directory.

The first automatic run succeeded September 30: Render recorded a Scheduled trigger, starting 08:00:08 UTC and finishing 08:01:39 UTC. Both PostgreSQL and portal read-back checks passed, and both monitors received success. The separate `analog-adventure-uploads` bucket is outside this portal backup's scope.

Existing application R2 upload key expires October 24, 2026; the new backup credential does not renew that separate key. The scheduled Backblaze credential expires December 28, 2026. No immutable retention policy has been enabled.


## Controlled artwork recovery — September 30, 2026

The owner uploaded `FSS.svg` to the dedicated Test Company campaign “Test Compay Artwork” and approved version 1 through the customer portal. A read-only source capture confirmed the file hash matched the approved proof. The monitoring baseline was tightened to 31 records, one R2 object, and 32 downloaded assets. The proof discrepancy changed from 0 captured of 9 reported to 1 captured of 10 reported: the same nine historical proofs remain missing. All other accepted gaps were unchanged. This baseline update accepted no additional historical loss.

A hosted manual backup finished at 13:55:26 UTC and verified 128 encrypted Backblaze objects under `recovery/postgresql/scheduled/portal/2026-09-30T13-54-25.628Z-08ef79ab-d428-45a1-8f1b-16feea596f42/`. Independent download verified each hash; recovery with the offsite-recovered recipient key decrypted 125 files into a new local directory. The restored SVG's 548,648 bytes exactly matched the source capture, its SHA256 matched the approved proof and R2 metadata, and every proof/campaign/organization field matched. The approval status, review timestamp, version, and links were preserved. The payout checkpoint still matched. The monitor remained up.

Private evidence: `recovery-private/artwork-test-restored-20260930/ARTWORK-RECOVERY-VERIFIED.json`. The restored file is `RESTORED-FSS.svg` in the same directory. The original artwork and Shopify records were not changed or deleted. This proves independent offsite recovery of a real uploaded artwork and its linked metadata into an offline catalog; it is not a re-import into Shopify or a full application disaster-recovery drill. The twelve historical/access gaps remain unresolved.

## Operational recovery copy in the existing development store

The owner confirmed that Analog Adventures Test (including Test Company and Tot Time Preschool) is already a development store and authorized a separate, clearly labeled recovery copy within it. No new Shopify store, app identity, database, or paid service was created for this narrower drill.

The verified Backblaze-restored `FSS.svg` was uploaded under a new immutable R2 asset ID. Two new records were restored from the saved fields: campaign `recovery-tc-art-26-20260930` and its version-1 proof. The campaign name and proof name start with `RECOVERY TEST`; the campaign remains draft. New identifiers and the new artwork location replace the original identifiers. The existing Test Company organization and product references remain linked. The original approved status, submit/review timestamps, reviewer ID, file name, MIME type, and content hash are preserved; provenance notes explain this was a recovery, not a new approval.

Read-back verified the new records and exact bytes. The production authorization helper with live Shopify reads allowed staff and Test Company's customer, denied Tot Time Preschool's customer (404), and denied a signed-out request (401). All 31 pre-existing portal records matched the pre-drill snapshot. The customer interface displayed the restored approval and successfully downloaded the same bytes. Fix `604bb89` deployed successfully to the existing test app. Staff then prepared and downloaded the restored proof through the actual embedded interface; the resulting file matched the original SHA256 and 548,648 bytes. The former new-tab private route did not complete authentication, so private proofs now prepare their short-lived links through App Bridge's authenticated fetch inside the embedded app. Existing authorization remains mandatory. Twenty-eight access/storage/route tests pass, and the new component passes the Shopify UI validator.

Monitoring minimums now include 33 records, two R2 objects, and 33 assets. The historical proof discrepancy is 2 captured of 11 reported (the same nine missing). The next manual backup finished September 30 at 14:13:37 UTC, verified 129 encrypted objects, and kept all twelve known gaps flagged. Its portal prefix is `recovery/postgresql/scheduled/portal/2026-09-30T14-12-42.749Z-314f4f58-cc16-452b-8756-aabf7d3bfa96/`.

Private execution evidence and new-to-original identifiers are in `recovery-private/operational-copy-20260930/journal.json`. This drill reuses the existing hosted application, Shopify organization/product records, and database. It does not prove recovery of a lost Shopify store, database-plus-app rebuild, full product catalog, or historical missing records. The separately prepared new-store plan was superseded by the owner's clarified scope.

## October 1 scheduled-run alert

The 08:00 UTC PostgreSQL backup passed. The portal archive was uploaded successfully, but its coverage check failed because the scheduled worker still carried the original baseline: 29 records, no R2 objects, 31 assets, and 0 of 9 reported proofs. The capture actually contained 33 records, two R2 objects, 33 assets, and 2 of 11 reported proofs. There were no count regressions and no additional missing proofs. Render's saved environment already held the correct September 30 baseline, but the cron worker's last build was September 29.

Independent download verified all 129 encrypted objects from `recovery/postgresql/scheduled/portal/2026-10-01T08-00-37.973Z-15b65485-a00e-40b4-8b9e-cbfb38fb3a44/`. The offsite-recovered key decrypted 126 files. Reassessing the saved report against the approved September 30 baseline passed with the same twelve historical gaps. Private evidence: `recovery-private/backup-diagnosis-20261001.json` and `failed-backup-restored-20261001/coverage.json`.

Rebuilt the existing cron service at commit `e4a4566` (build `bld-dav7ge142hec73darud0`, 37.8 seconds), without changing credentials, accepted gaps, or schedule. The replacement run started at 15:13:28 UTC and finished successfully at 15:14:39 UTC. PostgreSQL verified five objects; the portal verified 129 objects under `recovery/postgresql/scheduled/portal/2026-10-01T15-13-40.220Z-c0782985-24fd-4843-afee-d24ae5a30df3/`. Both Healthchecks monitors recovered.

Independent download and decryption verified all 129 encrypted objects and restored 126 files. The archive records the rebuilt commit and exactly the approved September 30 baseline. Coverage passed with no new gaps or count regressions; both restored R2 artwork files matched the original SHA256 and 548,648-byte size. Evidence: `recovery-private/repaired-backup-restored-20261001/REPAIR-VERIFIED.json`. The next 08:00 UTC automatic run remains a future event; this repair verifies deployment and a manual run, not tomorrow's execution.

## October 1 PostgreSQL operational-record migration

The hosted app now uses `PORTAL_DATA_BACKEND=postgresql` for proofs, production
batches, organization requests and delivery addresses. Four approved proofs and
one completed batch were restored from the independently verified pre-cleanup
archive, preserving original IDs and every field. A synthetic Test Company
organizer address was then saved successfully through the hosted staff interface.
Staff and customer views display the four approvals and can prepare private
artwork download links. The completed batch retains order #1010 and its original
proof ID/hash.

The new portal minimums are 34 Shopify metaobjects, 6 PostgreSQL portal records,
10 orders, 4 companies, 15 drafts, 4 R2 objects, 32 Shopify files and 35 downloaded
assets. Historical missing-record counts are unchanged. The additional campaign
count discrepancy (11 exported versus 10 reported) already exists in the
pre-migration snapshot and represents an extra exported record, not data loss.

The PostgreSQL scheduled archive at
`recovery/postgresql/scheduled/2026-10-01T18-20-21.334Z-9b2e9106-805b-45cd-86c0-05776578cd3a/`
was independently downloaded, decrypted with the offsite-recovered private key,
and restored into an isolated local PostgreSQL 18 database. All fields match
for 6 PortalRecord rows, 4 BulkCheckoutAttempt rows, 1 Session row and both
migration records; the full database schema also matches. The recovery database
has no network listener and no application was started against it.

The accompanying portal archive contains the same six operational records and
all original recovered fields. Its first coverage check used the old baseline;
this was diagnosed from its encrypted `coverage.json`, without accepting any
additional missing history. Updating an existing masked Render field must be
verified after save; then rebuild the worker and inspect a new archive's actual
baseline before relying on future automatic runs.

Private evidence: `recovery-private/postgres-migration-scheduled-restored-20261001/DATABASE-RESTORE-VERIFIED.json`
and `recovery-private/portal-migration-scheduled-restored-20261001/`.
The remaining business workflow and amount-only refund reconciliation are still
pilot gates; this migration does not clear them.
