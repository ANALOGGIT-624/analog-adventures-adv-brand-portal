# Backup retention rollout

Prepared October 13, 2026. Implementation pending; existing copies remain intact.
Approved policy: 30 days of daily backups and 12 monthly recovery copies.

## Current implementation findings

`scheduled-all.mjs` runs PostgreSQL and portal backups sequentially. Each archive
has its own random timestamped prefix and COMPLETE marker. Both upload encrypted
objects, read them back, and decrypt locally before reporting success. There is
no monthly copy selection or remote pruning. The parent job does not currently
publish a durable receipt associating the two archives as one recovery set.

The scheduled credential is limited to `recovery/postgresql/scheduled/`.
Portal archives live below its `portal/` subdirectory. A retention rule on the
entire scheduled prefix would therefore affect both archives and any monthly
copies placed below it. Do not apply a broad expiration rule.

## Implementation order

1. Inspect the existing bucket's lifecycle and Object Lock settings, without
   changing them. Verify the scheduled credential's effective permissions.
2. Add a common recovery-set identifier and a durable paired receipt written
   only after both archives pass verification. Preserve counts and known-gap
   status. Independently successful database backups must still survive a
   portal failure, but must not be labeled a complete paired monthly copy.
3. Introduce disjoint `daily/` and `monthly/` prefixes beneath the approved
   scheduled credential scope. Leave historical prefixes untouched. Each set
   must contain or explicitly identify all encrypted objects, manifests,
   recipient envelopes, COMPLETE markers, and the paired receipt.
4. Select one verified complete set per UTC calendar month, with idempotent
   retries. Download and verify both copied archives before marking a monthly
   set complete. A partial month-copy failure must remain visible in monitoring
   and must not remove the source. Do not equate a COMPLETE filename alone
   with verified contents or a gap-free backup.
5. Test partial uploads, failed read-back, interrupted monthly copies, month
   boundaries, retries, and preservation of previous verified sets. Verify an
   actual monthly recovery copy independently before any cleanup is enabled.
6. Produce a read-only cleanup report showing exact sets and object versions
   that would expire. Retain the most recent 12 verified monthly sets; elapsed
   days alone do not guarantee 12 copies when jobs are missed. Hold prior
   recovery points if new gaps appear, rather than aging them out blindly.
7. Request approval for the exact irreversible retention/deletion settings
   after the report and recovery evidence are reviewable. Keep deletion
   permissions separate from the everyday writer where supported.

## Provider constraints to verify in the account

Backblaze lifecycle rules can hide and permanently delete files, including by
prefix. They cannot assess paired recovery completeness or application gaps.
Object Lock prevents deletion until the configured date; enabling the bucket
capability cannot be undone. Default retention affects new uploads/copies,
not existing files. Governance can be bypassed by suitably privileged keys;
compliance retention cannot be shortened. Object Lock has no additional feature
fee, but retained objects incur normal storage charges. No setting or additional
storage commitment is approved by this implementation plan.

Sources checked October 13:

- [Backblaze lifecycle rules](https://www.backblaze.com/docs/cloud-storage-configure-and-manage-lifecycle-rules)
- [Backblaze Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock)

Do not claim retention enforcement, immutable backups, or monthly archival is
active until deployment and independent verification are recorded here.

## Account inspection — October 13

Backblaze dashboard confirms `analog-adventures-portal-backups` is private,
server-side encryption enabled, lifecycle set to Keep all versions, and Object
Lock disabled. It reports 5,091 files and 200.2 MB. Opened the Object Lock dialog
without changing its unchecked Enable Object Lock setting. Proposed next action:
enable the bucket capability and configure 30-day default compliance retention
for future backups, subject to explicit approval of the irreversible protection.
No lifecycle deletion rule or monthly archive automation has been enabled.

## Default protection enabled — October 13

Thomas explicitly approved the irreversible Object Lock capability and a 30-day
default. Enabled the capability, saved 30 days, and verified the dashboard shows
Default 30 Days. Lifecycle still keeps all versions. No old files were deleted
or retroactively locked. The console does not expose the retention mode here;
a read-only GetObjectLockConfiguration check with the existing scheduled key
returned AccessDenied (403), so compliance mode has not been independently
verified. No new privileges were granted to bypass this limitation.

Started the existing Render combined backup to verify compatibility. PostgreSQL
read-back/decryption succeeded at 12:48:40 UTC with five objects under
`recovery/postgresql/scheduled/2026-10-13T12-48-37.763Z-707d51ba-4963-4b62-bb61-37f099619082/`.
Portal verification succeeded at 12:49:54 UTC (8:49:54 a.m. Eastern), with
165 objects, four R2 objects, 35 downloaded assets and the same thirteen known
gaps. Prefix: `recovery/postgresql/scheduled/portal/2026-10-13T12-48-40.966Z-e73a5b92-944b-47e9-8cab-604a3690ccd9/`.
The combined job exited 0 and Render reported success at 12:49:57 UTC. This
verifies backup compatibility after the default was enabled, not independent
per-object lock-mode verification or a new database restore.

## Monthly-copy implementation — October 13

`BACKUP_MONTHLY_ENABLED=1` enables the paired recovery-set stage in the existing
combined cron worker. Daily archive prefixes remain unchanged for compatibility;
no broad lifecycle rule is safe on the legacy scheduled prefix. Each successful
combined run writes a unique `recovery/postgresql/scheduled/pairs/` receipt with
both verified encrypted inventories and the known-gap count. Captures remain
sequential, not an atomic snapshot.

The first successful enabled run each UTC month copies both encrypted archives
to a unique `monthly/YYYY-MM/<uuid>/` subtree within the existing credential
scope. Every source and destination object is hash-checked. The month COMPLETE
receipt is published last; later runs verify its entire inventory before reuse.
Partial copies remain unmarked and preserved; retries use a new unique prefix.
This assumes the existing single cron writer; do not run concurrent standalone
monthly publishers. No remote delete operation exists in this code.

The worker limits each encrypted object to 32 MiB during monthly copying to
bound memory. Larger objects fail the monthly stage visibly while retaining
daily backups. Monthly failures fail the cron run and portal backup monitor.
Monthly copies inherit the bucket's 30-day default lock, not a twelve-month
lock. Copies are currently kept indefinitely; retaining exactly the newest 12
months and pruning daily history require a separately reviewed cleanup stage.

Validation: 25 focused backup tests passed, including incomplete pairs, damaged
source/destination data, permission errors, existing-copy corruption, monthly
reuse, and UTC month rollover. Targeted ESLint and whitespace checks passed.
Hosted deployment and real monthly recovery verification remain pending.
