# Missed-order reconciliation

The existing paid pilot web app scans development-store orders every 15 minutes,
starting 30 seconds after server startup. It processes up to two pages of 25
orders per tick and saves its fixed scan window and cursor in PostgreSQL. A crash
replays the unfinished page. A completed sweep starts a new rolling 59-day scan.
This stays inside standard order access; it does not recover inaccessible history
or promise recovery after more than 59 days of downtime.

The webhook and reconciler share attribution logic. Existing verified manifests
are preserved. Individual orders require valid signed checkout tags and provable
artwork approval at purchase time. Automatic recovery refuses campaign or payout
references updated after purchase. Bulk orders require the saved checkout snapshot
and Shopify's actual draft-to-order relationship. Recovery atomically creates all
five attribution fields only if none already exists. Partial records, invalid
signatures, missing history and orders over 100 lines are held for staff review.

Staff can open Attributed orders to see the last check, last completed sweep and
orders requiring review, or run the next batch immediately. The review list is
retained across sweeps and retried. This is reconciliation, not a durable webhook
queue. It does not create purchases, issue refunds, fulfill orders or pay proceeds.

The scheduler is pinned to the existing development store and hosted app URL.
It uses the app's existing offline credentials and PostgreSQL table, with no new
service, credential or migration. This implementation assumes the current single
web instance. A multi-instance rollout needs a distributed scheduler lease; the
create-only attribution guard already protects against concurrent webhook writes.
The scheduler pauses during app downtime and resumes from saved progress. Staff
must inspect the last-check time; there is not yet a separate missing-run alert
for reconciliation. Backup monitoring remains independent.

Validation: 212 tests pass, one optional PostgreSQL test skipped. Tests cover
missing-delivery recovery, duplicate/concurrent writes, changed historical rules,
page restart/resume, failed queries, retried review items, ordinary orders and
truncated line lists. Production build and targeted lint pass. New and shared
GraphQL operations validate against Admin API 2026-07.

References: [Shopify orders query](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/orders).
## Hosted verification — October 9, 2026

Render deployed app commit `74494b8` successfully. The startup scan completed at
20:12:18 UTC; the staff **Check missed orders now** action completed another scan
at 20:14:48 UTC. Each scanned all 11 accessible orders, recovered zero, and left
no review items. The ten existing verified attribution records remained intact.
Before/after hashes of order attribution and portal business records matched.
The staff screen displayed the updated check and completion timestamps.

There was no genuinely missing attribution among current hosted orders. Recovery
of a missing delivery was proven in automated fixtures, not by deleting hosted
order fields or creating a new purchase. The 15-minute timer is configured; this
verification observed startup and manual execution, not a later timer tick.
No additional paid service was introduced.
