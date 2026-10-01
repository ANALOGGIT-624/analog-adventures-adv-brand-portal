# Isolated app recovery drill — October 1, 2026

Status: **local rebuild, recovered-data checks, real staff/customer authentication,
and authenticated HTTPS artwork downloads passed. Full hosted replacement
cutover remains untested. This does not clear the pilot.**

## Phase 1: offline recovery sources and isolation

- Source commit: `c963a10`, exported into a separate directory. The original
  checkout, active app, hosted database, Shopify settings and R2 bucket were not
  changed. Existing installed dependencies were copied; this was not a fresh
  registry-install or Docker/Render rebuild test.
- PostgreSQL source: independently downloaded B2 archive
  `recovery/postgresql/scheduled/2026-10-01T19-14-03.230Z-d11653a2-f4b2-4e0b-9ff1-13bddb39b6ec/`.
  All five encrypted objects passed transfer hashes. The offsite-recovered private
  key decrypted the dump, which restored into a new empty local PostgreSQL 18
  database with `pg_restore --exit-on-error`.
- Shopify/artwork source: independently verified portal archive
  `recovery/postgresql/scheduled/portal/2026-10-01T19-14-06.879Z-e30aacae-2d26-49d0-ac24-e0e1fbc622f0/`.
- Database used a private Unix socket, with no TCP listener. The app used a local
  read-only role; a write attempt was rejected. The HTTP server listened only on
  `127.0.0.1:55441`, used synthetic app credentials, and blocked outbound fetch,
  HTTP and HTTPS requests. No real Shopify token exchange or business mutation
  was attempted. Local recovery services were stopped after verification.

## Phase 1 checks completed

1. Generated the PostgreSQL Prisma client in the isolated copy and rebuilt the
   actual production server/client bundles successfully.
2. Started the rebuilt app against the restored database. `/health` returned
   HTTP 200 and `ok`. Repeated after a full server restart.
3. Missing-authentication requests to `/public/portal` and `/public/artwork`
   returned 401. Staff routes returned Shopify's authentication bootstrap shell
   with no recovered payout/artwork data. HTTP 200 for this shell is **not** a
   successful staff login. Bot requests receive the SDK's 410 response.
4. Restored database contains 7 portal records, 5 checkout attempts and 1 session.
   The actual record-store implementation reads the restored PostgreSQL data.
5. Executed actual artwork authorization and customer-portal route logic using
   explicitly simulated authenticated identities and archived Shopify responses.
   Test Company sees its four proofs; another company sees none of those proofs.
   Cross-company artwork requests return 404; anonymous requests return 401.
6. All four restored private artwork files match their archived SHA-256 hashes,
   totaling 1,098,538 bytes. Staff and matching-company authorization resolve the
   same asset identities. No replacement R2 bucket or signed network download was
   exercised.
7. Recovered order data recalculates #1010's $10 amount-only refund and #1011's
   $949.95 one-unit refund. Both yield $5 calculated proceeds; the saved bulk
   statement's $1 deduction leaves its $4 simulated payout. Earlier independent
   archive verification also checked both paid statements and archived campaigns.
8. Restarted the app and repeated HTTP, authorization, artwork, record and payout
   checks successfully.

Private evidence and restart scripts are retained under
`recovery-private/app-drill-20261001/`, outside Git. Evidence includes
`RESTORED-APP-CHECKS.json`, `HTTP-CHECKS.json`, build output and private server logs.
The restored database and encrypted archives remain available for follow-up.

## Timing and remaining acceptance

Work started at 19:26 UTC; the final restarted checks passed at 19:51 UTC. This
25-minute local exercise includes setup, approvals and test-harness corrections.
It is **not a proven end-to-end RTO**: replacement hosting, credentials, live
Shopify login, customer extension routing, object-store replacement and traffic
cutover were excluded. The paired source archives were produced seconds apart,
not in a cross-service atomic transaction. Exact replay cutoff/RPO is unproven.

The authenticated follow-up below verifies the real sign-in and HTTPS file
delivery portion. Full replacement hosting, object-store replacement, original
app identity/routing cutover and an agreed RTO/RPO remain unproven. Do not treat a
separate recovery app as proof that the original app can be cut over unchanged.

The most recent scheduled-worker run remains the successful manual verification
at 19:15 UTC. The next automatic run is October 2 at 08:00 UTC / 4am New York and
was not yet due during this drill. No automatic-run pass is claimed.

## Phase 2: authenticated HTTPS recovery follow-up

On October 1, after explicit approval, created **Analog Recovery Drill 20261001**
(app `430568243201`) and installed it only on
`analog-adventures-test.myshopify.com`. The original hosted app and live store
were not repointed. No additional paid service was created.

The isolated source uses the existing Shopify authentication SDK, a separate
in-memory session store, and the restored database's SELECT-only role. The
original recovered session was retained in the database but was not used for
recovery-app authentication. A minimal read-only staff page and customer
verification extension exercise the existing artwork authorization routes.
The customer query omits the unnecessary protected `displayName` field.
Shopify permissions are read-only; customer data was enabled for development
authentication, with no optional name/email/phone/address field access selected.

The app listened on loopback port 55442 behind a temporary Cloudflare HTTPS
tunnel. A local recovered-file adapter issued 60-second signed links and checked
the archived SHA-256 before serving bytes. It did not read the active R2 bucket.
Only health, authentication, static assets, read-only recovery views, artwork
authorization and signed restored-file delivery were exposed. Business write
routes were blocked. The customer page was added separately, without adding it
to navigation or replacing Brand Portal.

Verified outcomes:

- Real Shopify staff authentication displayed all four approved recovered proofs.
- Real customer authentication identified Test Company's existing test customer
  and returned its four recovered proofs. Current Shopify company membership,
  organization and campaign references were used for authorization.
- Both staff and customer independently authorized and downloaded **Test Compay
  Artwork** through HTTPS. Each browser download is 548,648 bytes and matches
  SHA-256 `c1a3e3cf4fdcaa3995d54b082863f72150c14011a41354ace29d14ea1baee71c`.
- The staff test passed again after restarting the recovery app and obtaining
  fresh app sessions; the final customer test also passed after that restart.
- Anonymous customer portal/artwork requests and unsigned restored-file requests
  returned 401. Business mutation requests returned 405. Staff authentication
  bootstrap HTML contained no recovered artwork or payout data.
- Final database counts stayed at 7 portal records, 5 checkout attempts and 1
  original session. A write probe was rejected by PostgreSQL.
- Shopify CLI configuration validation, isolated app build and extension
  component validation passed. The recovery extension's Preact configuration
  and new-tab download behavior were corrected during testing.

Private evidence: `LIVE-AUTH-CHECKS.json`, `HTTPS-CHECKS.json`, server logs,
isolated source and scripts under `recovery-private/app-drill-20261001/`.
The two downloaded test copies are in the Mac's Downloads folder. Credentials
and private evidence remain outside Git.

At completion the temporary tunnel, HTTP server and local recovery database
were stopped. The recovery Shopify app registration/install and unlinked
customer page remain for a future drill; their temporary backend is offline.
No new Render charge was introduced.

Limits: this used an adapted read-only recovery view and local file adapter,
a separate app identity, and current Shopify authorization references. It does
not prove replacement R2 provisioning, restored Shopify merchant-record imports,
unchanged production deployment, original-app cutover, or an end-to-end RTO/RPO.
Cross-company denial was verified in phase 1 with simulated identities; a second
real customer account was not exercised in phase 2. External pilot approval
still requires the remaining reliability/security, retention/rotation and
recovery acceptance work.

## Hosted-portal follow-up finding

The original Render `/health` check and staff dashboard passed after cleanup.
The original customer portal initially returned HTTP 500 / “Failed to fetch” at
20:29:51 UTC, while staff access was obtaining a new offline Shopify session.
After that session creation, a customer-page reload returned HTTP 200 at
20:30:58 UTC and displayed all four proofs and the $5/$4 paid statements.
The saved customer endpoint remained the original Render URL.

This finding was subsequently repaired in commit `87d2650` and verified on the
hosted development app. Customer-initiated renewal succeeded without staff
navigation after a controlled stale-expiry test, and the rebuilt backup worker
completed a verified backup. See [the repair and evidence](session-renewal-20261001.md).
A healthy `/health` response alone had not detected this customer-facing failure;
the repair was verified through real customer authentication as well.
