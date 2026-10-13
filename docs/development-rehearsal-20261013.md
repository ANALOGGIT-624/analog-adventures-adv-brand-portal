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
