# Customer portal session renewal — October 1, 2026

The recovery drill exposed a customer-portal HTTP 500 while the original hosted
app was renewing its Shopify offline session. Staff authentication then created
a session and the customer portal recovered after reload. This did not indicate
missing business records, but customer access must not depend on staff visiting
the app.

## Repair

The installed Shopify SDK refreshes expiring offline tokens, but its load,
refresh and save sequence has no cross-process coordination. The hosted web app
and scheduled backup worker share the same PostgreSQL session row. Both now use
a transaction-scoped PostgreSQL advisory lock keyed by app identity and shop.
Authenticated staff token exchange uses the same lock after verifying the
session JWT; Shopify still performs its normal staff authentication. Business
queries and mutations execute after the renewal transaction releases its lock.

A late API rejection cannot clear a newer stored credential, and a session with
a cleared access token and valid refresh token is eligible for unattended
renewal. SQLite development uses a single-process queue. There are no database
schema changes or new services.

Customer portal backend failures return private, uncached JSON with CORS,
HTTP 503 and Retry-After instead of an uncaught response that appears as
“Failed to fetch.” Authentication and company authorization remain required;
business mutations are not automatically replayed.

## Validation before deployment

- 184 application tests passed, including six SDK renewal/authentication cases
  and customer GET/POST failure handling with CORS and no business writes.
- Production build and targeted ESLint checks passed.
- Real PostgreSQL 18 integration test passed against a fresh local database:
  two independent Prisma clients, twelve concurrent SDK requests, exactly one
  OAuth refresh, persisted replacement credential, and lock release with the
  previous credential preserved after a failed renewal.
- The OAuth endpoint was simulated for these tests; hosted verification is
  recorded below after deployment.

The optional PostgreSQL test requires a fresh local database named
`session_renewal_test_<suffix>` via `SESSION_TEST_DATABASE_URL` and a PostgreSQL
Prisma client via `SESSION_TEST_PRISMA_CLIENT`. It deliberately refuses nonlocal
or other database names.

## Hosted verification

Commit `87d2650` was deployed to the existing Render web service and built for
the existing backup worker. Web deployment `dep-davce7fpn0mc73cgdd80` and
worker build `bld-davcegflk1mc739hhbh0` both succeeded.

At 20:50:56 UTC, only the saved access-token expiry timestamp for
`analog-adventures-test.myshopify.com` was made stale. The token values and
business records were left intact. The customer page was reloaded before any
staff navigation. Render logged creation of the renewed session at 20:51:03
and `GET /public/portal 200` at 20:51:04. The customer saw all four approved
proofs, both archived rehearsal campaigns and the $9 combined test proceeds.

A separate database check confirmed both access and refresh credentials rotated,
with the next access expiry at 21:51:02 UTC. A before/after fingerprint confirmed
all seven portal records and five checkout attempts were unchanged. Credentials
were not written to the report. Secure artwork preparation returned
`POST /public/artwork 200` at 20:51:41. The staff dashboard was then reloaded
successfully and showed four proofs. `/health` returned `ok`.

The rebuilt worker was manually triggered at approximately 20:51 UTC. Its
PostgreSQL archive was uploaded and read-back verified at 20:51:54. Its portal
archive was verified at 20:52:58: 162 transferred objects, 36 Shopify records,
7 PostgreSQL portal records, 11 orders, 4 companies, 16 drafts, 4 R2 objects,
32 Shopify file entries and 35 downloaded assets. The existing 13 known gaps
remain reported against the accepted baseline; they were not recovered by this
repair. Render logged successful job completion at 20:53:01 UTC. This was an
immediate manual run of the scheduled worker, not an
observation of the next 08:00 UTC automatic run.

Private database-check evidence is in
`recovery-private/session-renewal-result-20261001.json`. The local PostgreSQL
test process was stopped after verification. No new service or paid capacity
was added. Remaining pilot gates in the README still apply.
