# Isolated app recovery drill — October 1, 2026

Status: **local rebuild and recovered-data checks passed; live Shopify sign-in
and hosted replacement cutover remain untested. This does not clear the pilot.**

## Recovery sources and isolation

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

## Checks completed

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

The next live recovery exercise needs a separately reviewed HTTPS recovery
endpoint and Shopify authentication/routing arrangement. Do not repoint the
installed app, customer extension or live traffic merely to make the local drill
appear complete. Keep business mutations blocked during the rehearsal and verify
real staff/customer login and authorized artwork delivery before accepting the
full operational-recovery gate.

The most recent scheduled-worker run remains the successful manual verification
at 19:15 UTC. The next automatic run is October 2 at 08:00 UTC / 4am New York and
was not yet due during this drill. No automatic-run pass is claimed.
