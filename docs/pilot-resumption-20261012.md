# Pilot readiness follow-up — October 12, 2026

## Current hosted checks

- Render scheduled backups succeeded October 10 (2m45s), October 11 (2m26s),
  and October 12 (2m08s), on worker `a72d719`.
- October 12 logs confirm PostgreSQL backup verification at 04:01:07 EDT,
  portal backup verification at 04:02:36, and Render successful completion at
  04:02:39. Portal capture has 165 encrypted objects, 36 Shopify records,
  seven portal business records, eleven orders, four R2 objects and the same
  thirteen accepted historical gaps. This is worker verification, not a new
  full hosted restore.
- October 9's manual run still appears In progress after 73 hours while later
  scheduled runs succeed. The latest visible support notification is a waiting
  acknowledgement. Provider investigation remains open; no run was cancelled
  or triggered during this check.
- The reconciliation checkpoint completed automatically October 12 at
  14:56:49 EDT: eleven orders scanned, zero recovered, zero review items.
  At 15:08:55 EDT, hashes of the ten attribution snapshots and portal business
  records exactly matched October 9. No manual scan was needed.

## Next recovery exercise

Prepare a separate hosted replacement from the current verified source and
October 12 backup pair. Keep the active app, database and object bucket available
for rollback. Do not treat a separate temporary app login as original-app cutover.

1. Independently download and decrypt both backup archives into new local paths;
   record transfer and content hashes, backup timestamps and known gaps.
2. Provision a temporary empty PostgreSQL database and temporary web service only
   after a new bounded cost approval. The September one-time $1 authorization
   was for a different database and is not reused.
3. Restore PostgreSQL with fail-on-error, compare schema and business records,
   and verify recovered checkout snapshots. Keep database credentials private.
4. Restore original artwork bytes into a separate private object target; verify
   every content hash and restricted signed delivery. Approve any new credential
   scope at creation time. Do not copy production secrets into public artifacts.
5. Rebuild the production app from a pinned commit. Before starting a second app
   identity against the same store, prevent competing token refresh, scheduled
   reconciliation and business writes. Prepare explicit original-app URL and
   extension routing changes and their rollback before a cutover window.
6. Pause development-store business changes, capture a fresh paired backup and
   record the cutoff. Switch the original app identity/routing in the agreed
   test window. Verify real staff/customer sign-in, private downloads, tenant
   denial, recovered payouts, restart persistence and rollback. Account for any
   writes before returning to the previous database.
7. Record measured recovery duration and actual replay cutoff; agree acceptable
   recovery time/data-loss targets. Obtain final cleanup approval for temporary
   resources, then verify charges stop. Never delete source backups to clean up.

No temporary service or routing change has been created by this preflight.
The requested spend cap and any access approval are gates for the specific
provisioning steps, not permission to bypass cutover review.

## Other remaining pilot decisions

- Retention policy, credential-rotation owner and recovery-key custody procedure.
- R2 application credential rotation due October 24.
- Explicit acceptance of the historical synthetic-data gaps and pilot-store choice.
- Separate missed-reconciliation-run alert; currently staff inspect last-check time.
- Resolution of the stale Render manual-run record; later schedule health is proven.

## Independent recovery preflight completed

Downloaded the October 12 08:01 UTC backup pair directly from Backblaze into
new owner-only folders. All 5 PostgreSQL and 165 portal encrypted objects matched
their transfer hashes. The existing offsite-recovered recipient key decrypted
2 database files and 162 portal files with authenticated integrity checks.
The offline portal drill rebuilt its recovery catalog: 36 records, 11 orders,
35 assets; the historical TTW-MULTI payout checkpoint matched. Five of six
historical proof snapshots have matching archived bytes, consistent with the
13 known gaps. No hosted PostgreSQL restore or original-app cutover is claimed.
Evidence is under `recovery-private/recovery-preflight-20261012/`, outside Git.

## Proposed temporary hosting budget — approval pending

Use one temporary $7/month web service and one $6/month PostgreSQL compute
instance, plus minimum database storage, for less than 24 hours. Proposed
incremental Render cap: **$1 total for this drill**, subject to checking the
actual provisioning summary and stopping before exceeding the cap. These are
prorated resources, not a proposal to retain another permanent monthly service.
If cleanup cannot finish within the budget window, suspend/stop billable compute
where supported and seek a decision before extending the test. Storage can
remain billable until deletion; coordinate cleanup promptly.

Published prices checked October 12:
[Render pricing](https://render.com/pricing) and
[Render hosting costs](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses).
New security-sensitive access and final resource deletion require their own
specific approvals when the exact targets are known. A temporary-hosting spend
approval does not authorize changing the live store or deleting source data.
