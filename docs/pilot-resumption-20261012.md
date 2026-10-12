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

## Approved hosted drill — database phase

The owner approved the new $1 total temporary Render budget. Created
`analog-portal-recovery-20261012` (`dpg-db6j2p2j9qps73cj6250-a`) in Ohio,
PostgreSQL 18, 0.1c-256mb, 1 GB, autoscaling disabled. The verified plan is
$6.30/month prorated ($6 compute + $0.30 storage). Provisioned approximately
19:14 UTC October 12; cleanup remains required within the approved cap.

Restored the independently decrypted October 12 dump into this empty database
with an exact hostname/database guard, verified TLS and one transaction. The
first attempt rolled back because a verification query omitted the explicit
public schema after the dump cleared search_path. The corrected restore
committed at 19:18:13 UTC. Counts: 8 PortalRecord rows (7 business records and
1 reconciliation checkpoint), 5 checkout attempts, 1 session, 2 migrations.

At 19:19:22 UTC, a separate read-only COPY comparison matched every field of all
four tables against the original dump. Evidence: HOSTED-DATABASE-RESTORE.json
and HOSTED-ALL-FIELDS.json in the private preflight directory. PostgreSQL's
standard pg_restore 18.0 was built locally from official source to convert the
custom dump; COPY streams restored it over verified TLS. No system service was
installed and no active database was changed.

The replacement web-service form is prepared for the current durable-hosting
branch, Dockerfile.postgresql, /health, $7/month compute and auto-deploy off.
Creation is pending specific approval to store a limited read-only database
credential in the temporary app. The proposed credential excludes Session and
all writes; synthetic Shopify authentication will keep this initial deployment
separate from the active app. Full authentication/cutover and replacement
object storage remain separate unfinished checks.


The owner approved limited recovery-app database access. The expiring role
`recovery_reader_20261012` can SELECT only PortalRecord and BulkCheckoutAttempt;
its default transaction mode is read-only and it expires October 13 at 19:00 UTC.
Actual application record-store checks read 4 proofs, 2 batches and 1 delivery.
Session SELECT and a no-op UPDATE were both rejected. Credentials were saved in
the temporary app's private Render environment with synthetic Shopify values.

Created temporary web service `srv-db6j6749v7es73fmgi00`, named
`analog-portal-recovery-app-20261012`, at approximately 19:21 UTC. Deployment
`dep-db6j67k9v7es73fmgjg0` builds source `4b089db`; auto-deploy is off, health
path /health, Dockerfile.postgresql, Ohio, $7/month prorated. No R2 credentials
or active-app Shopify credentials were copied into the service. Its configured
URL keeps the original-app-only reconciliation scheduler disabled.


Startup exposed the SDK's asynchronous Session-table availability check. The
limited role intentionally cannot read public.Session, so the initial service
restarted despite briefly healthy /health responses. A separate recovery_app
schema now exposes read-only views of the two business tables and an empty
Session table for startup checks. The original restored session stays blocked.
The reader can count zero isolated sessions; all original public-table fields
still match the backup after this adaptation. This is an isolated deployment
exercise, not proof that original-app credentials/routing have been cut over.


## Verified hosted deployment and suspension

Final deployment `dep-db6jaobl550s73b6b7eg` became live at approximately
19:31 UTC. After correcting the saved schema setting, HTTPS /health returned
200 with `ok`; anonymous /public/portal and /public/artwork returned 401 with
a browser User-Agent. The SDK separately returned 410 for a bot User-Agent.
Render records “Service restarted by you” at 15:34 EDT. The post-restart HTTP
checks passed, and every public-table field still matched the dump at
19:34:38 UTC. Private evidence: HOSTED-HTTP-initial.json,
HOSTED-HTTP-restart.json, HOSTED-ALL-FIELDS.json and APP-READER-CHECKS.json.

Both temporary services were then suspended at approximately 19:36 UTC. Render
confirmed suspended status and displayed “You are not billed for suspended
services.” No database or source archive was deleted. At the listed prorated
rates, this brief compute use is estimated below $0.02; the final invoice has
not been inspected. The approved $1 total cap remains in effect for any resumed
work. The read-only login expires October 13 at 19:00 UTC and must be renewed
before a later resume.

This completes isolated hosted database restore, production-container rebuild,
read-only app data access, unauthenticated denial and restart persistence. It
does not complete real Shopify authentication, replacement R2 signed downloads,
or original-app routing cutover/rollback. Those require a controlled next phase
with explicit approval for additional temporary-app access. Active pilot and
live-store routing, databases, credentials and artwork storage remain unchanged.


## Replacement private artwork storage verified

With explicit approval, created private R2 bucket
`analog-portal-recovery-20261012` and two bucket-scoped 24-hour credentials:
an upload credential used locally and a separate Object Read only credential
saved in the suspended temporary Render app. Both expire October 13, 2026.
The original artwork buckets and their credentials were not modified.

At 19:48:49 UTC, all four recovered R2 objects (1,098,538 bytes total) were
verified against the authenticated backup by byte count, SHA-256, and stored
SHA-256 metadata. Original object keys were preserved. Conditional writes used
If-None-Match: *; repeat verification did not overwrite objects. The read-only
credential successfully listed and downloaded the restored objects.

A 60-second signed download returned HTTP 200 with matching original bytes.
Unsigned requests returned HTTP 400; tampered and expired signatures returned
HTTP 403. The initial verifier expected 403 for every rejection and therefore
reported a failed assertion for the unsigned 400 response; the corrected
verifier explicitly accepts 400/403 for unsigned rejection, and the final run
passed. Private evidence: R2-HOSTED-RESTORE.json.

Render saved all four ARTWORK_R2_* settings, and their presence persisted after
a page reload. The service remained suspended; these settings have not yet been
exercised by the hosted app process. Real Shopify sign-in and authenticated
artwork delivery through this replacement app, followed by controlled original
app routing cutover/rollback, remain outstanding. No pilot-readiness claim is
made from the direct storage checks alone.

## Original development-app authentication access prepared

After explicit approval, saved the original development app's client ID, secret
and existing scopes in the suspended temporary Render app. Verified all three
saved values after reloading Render. The temporary database URL and private
replacement-bucket read-only credential were retained; active database access
and original restored Shopify session access were not granted.

Temporarily resumed the recovery database and granted INSERT/UPDATE/DELETE only
on recovery_app.Session to recovery_reader_20261012, with the role's default
transaction-read-only setting disabled so those narrowly granted writes work.
At 20:00:35 UTC a synthetic insert/update/delete probe passed inside a rolled-back
transaction; original public.Session reads and business-table updates returned
permission denied. Existing table write grants and elevated role flags were
checked before changing permissions. At 20:01:46 UTC every field in all four
original restored tables still matched the backup. Private evidence:
AUTH-PERMISSIONS.json and HOSTED-ALL-FIELDS.json.

The recovery web service was never resumed. No real sign-in, original routing
change, active database modification, or live-store change occurred in this
phase. Prepared local cutover/rollback TOML copies differ only in application_url
and auth.redirect_urls; they have not been Shopify-CLI-validated or deployed.
Before running the replacement with the original app identity, complete the
read-only HTTP route boundary and controlled fresh-backup/freeze/rollback steps
recorded in the private cutover-plan/REVIEW.md.

The database was suspended again after the checks; Render confirmed “Suspended
by you.” Both temporary services remain suspended. The additional brief database
compute remains within the approved $1 aggregate budget; invoice totals have not
been independently checked.

## Read-only HTTP recovery boundary prepared

Added a separate Dockerfile.recovery startup path. The normal production
Dockerfile/start command is unchanged. Its gateway exposes only reviewed
read routes, static assets, Shopify authentication GET routes, customer CORS
preflights, and POST /public/artwork (authorized signed-link issuance).
All other methods/routes, including proof approval/uploads, customer requests,
checkout creation, payouts, production actions, and webhooks, return 405 before
reaching the application. Ambiguous encoded/traversal paths are rejected.

The underlying standard React Router server listens on loopback only. Startup
refuses any target other than the named temporary Render URL/database/schema,
limited database role with verify-full TLS, and replacement private bucket.
The existing reconciliation scheduler is disabled by the temporary app URL.

Validation: both focused tests passed, including an actual HTTP proxy test that
proved blocked actions never reached the upstream, and that artwork POST kept
its authorization header/body and propagated an upstream 401. Targeted lint and
startup refusal checks passed. This is prepared source, not a hosted deployment
or completed cutover. Real authentication and rollback remain outstanding.

## Controlled development-store cutover and rollback completed

The user approved an idle 20–30 minute test window. A fresh combined backup
finished successfully at 20:08:16 UTC, before suspending the original web service
and cron around 20:13 UTC. Both encrypted archives were independently downloaded,
hash-verified and decrypted locally. The separate live store was not involved.

The temporary app used Dockerfile.recovery and the explicit recovery startup
command. Its first resumed deployment failed while the temporary database was
still resuming; a subsequent manual deployment succeeded. Embedded Shopify login
then exposed a missing read-only root redirect. Commit a07486e allowed `/`, and
the temporary deployment was Live at 20:16:23 UTC. Business-changing requests
remained blocked by the gateway and database grants.

Released Shopify version recovery-cutover-20261012, changing the app and callback
URLs to the temporary host, and saved the temporary customer Portal API URL.
Real staff authentication succeeded. Staff saw both organizations, eleven
campaigns and all four approved proofs from the restored database. Preparing the
original Test Compay Artwork secure download produced an Open proof link.
The browser download operation timed out, so a browser-delivered file/hash match
is NOT claimed. The earlier independent private-R2 byte/hash checks remain valid.

The existing real customer session was Tot Time Preschool. After reloading, its
portal loaded successfully through replacement hosting, showed only Tot Time's
organization/campaigns/statements, and showed no Test Company proofs. This proves
the observed company-scoped display, not a new exhaustive authorization test.
Test Company's own customer artwork download remains outstanding.

Staff client-side navigation initially returned 405 during React Router lazy
route discovery; a direct reload of the proofs page worked. Inspection of the
installed React Router handler identified `/__manifest` as asset metadata rather
than a loader/action endpoint. Added GET/HEAD allowance for this exact path;
POST remains denied. Both focused gateway tests pass. This final navigation fix
was prepared after rollback and has NOT been deployed or browser-rechecked.

Rollback restored active Shopify version attribution-definition-sync-20261009
(1161575858177), including the original app/callback/proxy settings, and saved
the original customer endpoint `https://analog-portal-pilot.onrender.com/public/portal`.
Stopped the temporary web service before transferring its newest offline sign-in
session back to the original database. This updated only the session row;
business tables were untouched. Resumed the original web service and backup cron.
Render rebuilt the latest branch commit a07486e on resume (it did not simply
restart the older image); the normal PostgreSQL Dockerfile/startup was retained.
The original app deployment succeeded in 48.9 seconds, starting at 20:22:49 UTC.
Staff's iframe hostname and real Tot Time customer portal were verified back on
the original hosting. Both temporary services were confirmed suspended afterward.

At 20:24:47 UTC, all eleven orders (ten verified attributions) and portal business
records matched the pre-cutover fingerprints exactly. Reconciliation scanned
eleven orders with zero issues and zero recovered records. SHA-256 fingerprints:

- Orders: `2764f9c543cf17ac4878cdb81579413cc253ab0b4eafcab2ccea244fe069797a`
- Business records: `3d65e5c3555a1304ca4fda3dafaa8ae07e33e2f435bde848121c893b894e1d32`

The post-rollback combined backup finished successfully at 20:24:43 UTC, with
backupJobComplete true and exitCode 0. It verified five database archive objects
and 165 portal archive objects, retaining the same counts and thirteen known
coverage gaps. Scheduled backups are resumed at 08:00 UTC daily.

Private evidence is in cutover-preflight-20261012, SESSION-ROLLBACK.json and the
before/after reconciliation reports. The limited cutover/rollback passed, but
full hosted artwork recovery remains incomplete: recheck navigation and download
the original artwork through staff and the Test Company customer session, then
compare its bytes/hash. This is not pilot sign-off. Temporary services were
suspended within the approved budget window; final invoice totals were not checked.

## Test Company download and navigation retest

After the user signed into Test Company and replied ready, resumed the same
temporary database/app. Commit 717312a deployed successfully in 35.8 seconds
starting at 20:34:37 UTC. A new pre-test fingerprint at 20:35:17 UTC matched the
earlier baseline. Paused the original development app and cron, preserved its
current offline session separately, released the existing recovery version and
saved the recovery customer endpoint again.

Real staff navigation from Artwork proofs to Dashboard and back worked without
a reload or 405, confirming the `/__manifest` correction on hosted recovery.
The staff iframe hostname was verified as the temporary recovery host. The real
Test Company customer saw its own organization and approved artwork.

Chrome's customer download returned `/Users/thomasoneil/Downloads/FSS (4).svg`.
At 20:38:17 UTC its 548,648 bytes and SHA-256 exactly matched the original:
`c1a3e3cf4fdcaa3995d54b082863f72150c14011a41354ace29d14ea1baee71c`.
Private evidence: browser-customer-artwork.json.

Staff secure-link issuance succeeded, but the in-app and Chrome iframe download
capture operations timed out. Local `FSS (5).svg` was saved at 20:37:48 UTC during
the staff attempt, three seconds after the customer file. It also matched the
original size/hash at 20:40:10 UTC (browser-staff-artwork.json). A later file was
saved during another attempt. Treat the staff result as a matching artifact
correlated by save time, not a browser-confirmed download event. Browser policy
blocked visiting Chrome's internal downloads page to confirm provenance; no
alternative access to that internal page was attempted.

Restored the original Shopify version and customer endpoint, suspended the
temporary web service, transferred its latest offline session back, and resumed
the original web/cron. Original hosting rebuilt 717312a successfully in 1m02s
starting at 20:41:28 UTC. Staff proofs loaded through the original hostname again.
The temporary database was suspended after session handoff. At 20:42:08 UTC,
all eleven orders and portal business fingerprints still matched the pre-test
values exactly. No business mutation was submitted during this read-only retest.

A fresh Test Company browser tab loaded the original portal successfully after
rollback. The final combined backup logged exitCode 0 at 20:43:46 UTC and Render
confirmed success at 20:43:49 UTC: five database objects and 165 portal objects,
with unchanged counts and thirteen pre-existing gaps. Both temporary services
were confirmed suspended. Remaining pilot decisions include retention, key
rotation ownership (original R2 key due October 24), acceptance of historical
test-data gaps and pilot-store selection. Preserve the staff download evidence
qualification above; the customer end-to-end download and hosted navigation
checks are complete.
