# Development-store rehearsal — October 13, 2026

## Approved scope

Thomas approved newly created test records on
`analog-adventures-test.myshopify.com`, excluding the thirteen historical
exceptions. The separate live store is outside scope. This decision does not
assert recovery of missing historical data or approve a live pilot.

The independently decrypted October 13 archive reports zero unexpected gaps
and thirteen baseline exceptions: limited order history; seven record-count
differences (three increases and four shortfalls); four inaccessible historical
records; and one unavailable external video. Preserve these reports and backups.

## Execution checklist

All steps below are pending for this fresh-record rehearsal. Prior successful
workflow tests remain evidence, but are not marked as new results here.
Use a unique `REHEARSAL-20261013` label and record actual IDs after creation.

1. Confirm the active hosted app and development-store test-payment setup.
   Use Test Company and the existing Tot Time contact for isolation checks;
   create fresh campaigns and artwork records rather than editing old fixtures.
2. Upload a fresh artwork file through staff, approve through the matching
   customer account, and verify staff/customer downloads against the source hash.
   Capture an actual browser download event to close the earlier staff-evidence
   qualification. Verify the other company cannot access the new record.
3. Create individual-shipping and bulk-delivery campaigns. Record prices,
   quantities, delivery charges, payout rules, and approved artwork before orders.
4. Complete test-mode purchases, including duplicate checkout submission.
   Verify the intended number of orders, delivery mode and immutable artwork/
   attribution snapshots. Never substitute a real card or real charge.
5. Let automatic reconciliation run. Verify attribution, no duplicate business
   effects, and no unexplained review items. Record the completed-sweep time.
6. Process test production and delivery for both modes. Apply a $10 test refund
   and verify net sales and payout adjustments reconcile to Shopify records.
7. Review final statements against orders/refunds. Record test payout status
   without transferring funds, then archive the fresh campaigns. Verify archived
   records and artwork remain readable by the authorized company.
8. Capture the completed records in a verified backup and independently decrypt
   it. Compare artwork bytes and business records. Do not delete active records
   to simulate failure or provision a new paid recovery service without approval.

## Acceptance and stop conditions

Thomas is the owner. Every step needs observed evidence before it is marked
passed. Stop on cross-company access, duplicate financial effects, missing or
changed attribution, incorrect refund/payout totals, failed artwork hashes, or
unexpected backup gaps. Preserve evidence and repair before continuing.

A rehearsal pass requires both delivery modes, correct $10 refund reporting,
duplicate-submission safety, authorized downloads, isolation, automatic
reconciliation, payout arithmetic, archive readability, and verified recovery
of the fresh records. It does not establish a broader production recovery-time
or data-loss guarantee. Live-store configuration and launch approval remain
separate. An intentional missed-run alert transition remains untested; inbox
delivery of the Healthchecks integration test is confirmed.

## First execution evidence — October 13

Created `REHEARSAL-20261013 — Individual Shipping`, permanent campaign ID
`REHEARSAL-20261013-IND`, for Test Company Pilot Store. It remains draft with
no dates set, individual shipping, batch-after-close production, retail pricing,
The Inventory Not Tracked Snowboard, and the existing test-only $5 per fulfilled
unit/zero-delay payout rule. No checkout or payment occurred.

Staff uploaded fresh `REHEARSAL-20261013.svg` at 09:47:02 Eastern; the signed-in
Testy Tester customer approved Version 1 through the portal. Source: 585 bytes,
SHA-256 `5b3b248e6e4bb832c07467cc1ed2e2471bf7dce7900c2136af6c87facff2a457`.
The customer download matched this hash. Browser download-event capture timed
out; filesystem arrival is corroborating evidence, not a captured download event.
A second file arrived after the staff download click and also matched all 585
bytes and the source hash; see private download verification.
The earlier event-capture qualification remains open. Native Chrome file selection
worked after automated chooser events timed out. No upload permission change made.

Private evidence: `recovery-private/rehearsal-20261013/`. Remaining: fresh-record
isolation, test-payment setup verification, campaign dates/lifecycle, bulk campaign
and proof, purchases/refunds/payout/archive, and fresh-record backup/recovery.

## Isolation, test gateway, and individual purchase — October 13

At 14:00:13 UTC, the existing hosted isolation harness passed all 18 assertions
using the fresh rehearsal proof specifically. Owner download returned 200;
Tot Time download returned 404, and foreign approval/revision attempts returned
403. Anonymous/expired/invalid authentication was denied. Both company views
were isolated, and all PostgreSQL portal business records were unchanged.
This used locally signed short-lived test tokens, not a fresh Tot Time browser
sign-in; the method limitation from the October 9 report still applies.
Evidence: `recovery-private/rehearsal-20261013/isolation-result.json`.

Shopify Payments settings showed **Test payment gateway — Active**, and checkout
independently displayed Test Payment Gateway instructions. No provider settings
were changed. The individual campaign was set live with start October 13 and
close October 14 (stored as 00:00:00Z and 23:59:59Z respectively).

The public campaign page added one Inventory Not Tracked Snowboard ($949.95).
Checkout used the gateway's simulated approval number, free Standard shipping,
and PO `REHEARSAL-20261013-IND`. Confirmation `LW5XG8HXF` succeeded. Staff's
Attributed orders page shows **#1012**, created 10:03:43 Eastern, verified,
campaign `rehearsal-20261013-ind`, one attributed unit, production proof Version 1.
This is a simulated test purchase, not a real card charge. Duplicate checkout
submission was not exercised in this purchase. Production, refund, payout,
archive, bulk-mode and final backup/recovery steps remain pending.

## Bulk checkout through archive — October 13

Created `REHEARSAL-20261013-BULK` for Test Company with bulk-to-organizer delivery,
the same test payout rule/product, and fresh approved Version 1 using the 585-byte
rehearsal SVG. Proof record `13e56576-3e2c-42cd-bd83-2e4c6e5415f4` retains the
source hash. Individual proof record is `08a4e8c9-5232-4076-8823-29d12c2a5546`.

Closed the individual campaign after its purchase at 14:14:29 UTC. The initial
close without a new date was correctly rejected because the saved close date
was in the future; selecting today recorded the actual close time. The public
organization page then exposed the bulk campaign.

Bulk quantity two was submitted with a double-click, then retried by returning
to the same form. The retry returned the identical checkout URL. A read-only
PostgreSQL check found exactly one matching attempt and draft
`gid://shopify/DraftOrder/1620045267129`. Evidence is
`recovery-private/rehearsal-20261013/bulk-duplicate-result.json`. This verifies
that observed double-click/retry sequence, not arbitrary concurrent traffic.

Checkout locked the existing test organizer destination and showed free bulk
shipping. Test Gateway approved $1,899.90 for two units, confirmation `4I5AG5G4R`.
Buyer billing remained separate from organizer delivery; its existing saved
company label remained Tot Time while synthetic buyer name/address were used.
This billing label is not portal campaign attribution. Order **#1013**
(`18938294468793`) was verified against the bulk campaign, two units and Version 1.
The campaign closed at 14:16:15 UTC.

Both simulated production batches traversed queued → in production → ready to
ship → completed and became locked:

- `REHEARSAL-20261013-IND-BATCH-20261013141642`: #1012, one unit.
- `REHEARSAL-20261013-BULK-BATCH-20261013141719`: #1013, two units.

Both snapshots retain SHA-256
`5b3b248e6e4bb832c07467cc1ed2e2471bf7dce7900c2136af6c87facff2a457`.
Shopify separately marked both test orders fulfilled with customer notification
unchecked. No shipping label was purchased, tracking invented, or physical
shipment performed. Delivery receipt itself was not simulated/verified.

Applied a $10 amount-only refund to #1012 on the Bogus Gateway, with refund
notification unchecked and an explicit test reason. Shopify showed partially
refunded and $939.95 remaining. The app and customer statement both correctly
report $949.95 gross, $10 refund, $0 deductions, and $5 proceeds. Amount-only
refunds do not remove units from the fixed-per-unit rule. Bulk reports $1,899.90
gross, $0 refund/deductions and $10 proceeds for two fulfilled units.

Recorded both rehearsal statements as **paid** solely to test the payout status
workflow; **no funds were transferred**. Paid timestamps: individual 14:20:26 UTC,
bulk 14:20:37 UTC. Both campaigns were then archived. The signed-in customer
still sees both approved proofs, archived campaigns and paid statements. The
14:21:16 UTC automatic reconciliation completed with both new orders verified.

Remaining gates: independently back up/restore these fresh final records and
artwork, retain the download-event capture qualification, and qualify any wider
pilot claims. This rehearsal does not resolve the excluded historical gaps.
