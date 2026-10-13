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
The scheduler pauses during app downtime and resumes from saved progress. A separate Healthchecks missing-run alert was deployed October 13, as recorded
below. Staff should still inspect review items and the completed-sweep timestamp.
Backup monitoring remains independent.

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


October 12 follow-up: the automatic checkpoint completed at 18:56:49 UTC,
scanning all eleven orders with no recovery or review items. Attribution and
business-record hashes still matched October 9. This establishes subsequent
automatic execution; it does not prove every intervening timer tick ran.

## Separate reconciliation monitoring — October 13 preparation

Prepared `ORDER_RECONCILIATION_MONITOR_URL` and a dedicated Healthchecks check
named Portal order reconciliation, using the project's existing email integration.
The period is 15 minutes with 15 minutes of grace (a missing-run alert roughly
30 minutes after the last success). The check has not received its first ping.
The private ping URL stays outside Git and needs to be installed in Render.

The monitor wrapper sends empty start/success/failure requests to hc-ping.com
only. Success follows persisted batch processing; review items send failure.
Exceptions send failure without exception text or order data. Busy attempts do
not ping because the existing concurrency guard returns before monitoring.
Monitoring outages do not prevent reconciliation, but are logged as failures;
a stopped or hung scheduler eventually misses the independent check deadline.
This monitors batch execution, not a guaranteed time to finish a large sweep.

Validation: 12 reconciliation/monitor tests pass, targeted ESLint and production
build pass. No Shopify query or attribution-writing logic changed. Deployment
and notification evidence are recorded below.

## Monitoring deployed — October 13

Thomas approved saving the private check URL in the existing Render app and
deploying. Render deployed `b155c7b` as `dep-db72vs59fdbs73ertfjg`; the service
logged live at 13:21:24 UTC. Its automatic startup reconciliation completed at
13:21:48 UTC (9:21:48 a.m. Eastern), scanned 11 orders and reported zero review
items. Healthchecks independently showed the check up, a two-second run, the
15-minute period and 15-minute grace, and the existing email integration ON.
No synthetic success ping was used to establish this result.

This verifies a real automatic run and successful monitor delivery. Failure
signaling is covered by automated tests; an intentional missed-run or failure
email delivery test has not been performed. A subsequent successful check-in was observed around 09:36 Eastern,
consistent with the 15-minute timer following the 09:21 startup run. The ping credential stays outside
Git; no order contents are transmitted to Healthchecks. No paid service added.

## Email integration test — October 13

The existing email integration’s Test action returned “Test notification sent!”
and “Delivered, now” for the configured owner email. All three checks remain
assigned. Thomas supplied an inbox screenshot showing “DOWN | TEST” at
09:30:59 Eastern and “OK, all checks up” in the project overview, confirming
inbox receipt. This was the integration test notification, not a real outage. It does not exercise a real missed-run or failure
transition. No app or backup job was paused and no check assignments changed.

## Controlled missed-run transition — October 13

Thomas approved temporarily shortening this existing check to a one-minute
period and one-minute grace, including alert emails to the owner. The app and
backup services continued running. Healthchecks observed the last automatic
success at 10:51 Eastern, then late and **up → down at 10:53 Eastern** when no
new success arrived under that accelerated deadline. No artificial failure ping
was sent.

Restored the normal **15-minute period and 15-minute grace**. The staff
**Check missed orders now** action completed a real reconciliation sweep at
`2026-10-13T14:54:49.775Z`; both fresh rehearsal orders remained verified.
Healthchecks received its actual start/success signals (#15/#16) and recorded
**down → up at 10:54 Eastern**, with a two-second execution and 1m33s monitored
downtime. No Ping Now or synthetic success request was used. The monitor is up
and its original schedule is restored.

This verifies missing-success detection and recovery signaling on the real
check with an accelerated deadline; it does not claim the app stopped or prove
a 30-minute production outage. Thomas subsequently confirmed receipt of both the DOWN and recovery emails
on October 13. This closes the controlled alert-delivery acceptance check. Private screenshot evidence:
`recovery-private/rehearsal-20261013/monitor-transition-evidence.png`.
