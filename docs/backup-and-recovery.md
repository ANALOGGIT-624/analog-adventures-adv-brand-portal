# Portal backup and recovery

These tools create an encrypted, read-only capture and restore it into a new
local directory. They do not import records into Shopify, reset a database,
delete remote files, or start a restored app. A successful offline drill is
one prerequisite for pilots, not proof that a production restore is complete.

## Capture scope

- SQLite sessions and checkout attempts, copied using SQLite's backup API and
  checked with `PRAGMA integrity_check`.
- Paginated portal metaobjects and their definitions; accessible order
  attribution, line items and refunds; company/contact ownership and delivery
  locations; draft orders and their line items.
- Shopify Files inventory and downloadable original image/generic-file bytes;
  every object in the configured private R2 artwork bucket.
- Historical proof lookups from order snapshots, supplied evidence files,
  committed source history in a Git bundle, and schema/configuration files.

This is a portal recovery export, not a complete Shopify-store backup. It does
not capture the full product/theme/customer/payment configuration. Shopify's
order access window applies without `read_all_orders`. Unsupported media,
unavailable files, inaccessible historical records, count mismatches, and
refund lists at the API limit are reported as gaps. Do not equate a successful
archive operation or nonzero definition count with complete business data.

Pause app writes during capture. Cross-service exports are not atomic. R2
inventory and Shopify definition counts are checked at the end; this does not
detect every concurrent field update. Production recovery needs continuous
database protection and a durable history of successful portal changes.

## Local commands

Use Node 22.12+ (tested with Node 24), Python 3, Git, Shopify CLI, and installed
project dependencies. The CLI must already be signed into this app/store.
Store all backup output outside the repository in a mode-0700 directory.

Generate a 32-byte recovery key once using `createKey` from
`scripts/recovery/archive.mjs`; keep it in a mode-0600 file. Never print it,
commit it, or put it inside the backup. Escrow a second copy in a password
manager or separate secure offline location before relying on this backup.

```sh
node --env-file=.env.artwork scripts/recovery/capture.mjs \
  --store analog-adventures-test.myshopify.com \
  --database prisma/dev.sqlite \
  --key /absolute/private/path/recovery.key \
  --output /absolute/private/path/new-capture

node scripts/recovery/restore.mjs \
  --source /absolute/private/path/new-capture/sealed \
  --key /absolute/private/path/recovery.key \
  --destination /absolute/private/path/new-isolated-restore
```

Capture exit codes: 0 means captured without reported gaps, 2 means the archive
was created but has known gaps, and 1 means capture failed. Preserve and inspect
the report in all cases; do not replace a known-good offsite backup based only
on the presence of an archive.

Capture destinations and restore destinations must be new. Optional repeated
`--evidence /absolute/path/file` includes known historical exports. Raw capture
and restored files contain private data and credentials; keep their directories
private and remove disposable working copies only after verification and key
escrow. Never run the restored app with copied live credentials.

## Encryption and verification

Each file uses AES-256-GCM with a fresh random 96-bit nonce and its relative
path as authenticated associated data. The encrypted manifest records SHA-256
and byte length for every source file and hashes of encrypted objects. A
completion marker is written last. The archive format is versioned and the
implementation is included in Git; retain a separate copy of these recovery
scripts alongside the encrypted backup so that restoration does not depend
on decrypting its own instructions. This is project-specific tooling, not an
independently audited backup product.

Restore authenticates the manifest, checks object hashes, refuses unsafe paths,
refuses to overwrite an existing destination, verifies each restored file,
checks SQLite integrity/row counts, and constructs a searchable recovery
catalog. It recalculates the recorded TTW-MULTI checkpoint using the app's
existing payout logic and checks historical proof hashes against saved files.
It never reissues payments, refunds, orders, or approvals.

## Independent storage recommendation

Use a separate Backblaze B2 account and private bucket for sealed backup sets,
with MFA and separate backup credentials. The active app's R2 key must not have
access to backups. Use a bucket-scoped backup writer without delete privileges,
and a separate restore reader. Keep the encryption recovery key outside B2.

Proposed initial policy, to review before enabling locks: daily captures,
30-day immutable retention for daily backups, and longer monthly archives
according to an agreed business/privacy retention policy. Keep at least one
prior verified backup when newer captures have gaps. Do not activate automatic
pruning before the first offsite restoration test succeeds. Long-term approved
artwork retention is separate from the rotating backup schedule.

Provider pricing and retention features should be rechecked at setup:

- https://www.backblaze.com/cloud-storage/pricing
- https://www.backblaze.com/docs/cloud-storage-object-lock

No independent account, automatic schedule, retention lock, or offsite copy is
created merely by running these scripts.

## Pilot gate

Require all of the following before real pilots: resolved historical-data
gaps or an explicitly documented synthetic test baseline; stable hosting and
released app definitions; managed database point-in-time recovery; an
independently stored encrypted backup; separately held recovery key; and a
measured end-to-end restore into a separate test environment. The proposed
15-minute data-loss and four-hour recovery targets are not yet achieved by
these manual capture tools.
