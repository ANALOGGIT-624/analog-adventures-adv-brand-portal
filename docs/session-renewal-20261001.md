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

Pending deployment of both web app and backup worker, a controlled expiry of
only the development store's saved session timestamp, customer-initiated
renewal without staff navigation, and a successful backup run.
