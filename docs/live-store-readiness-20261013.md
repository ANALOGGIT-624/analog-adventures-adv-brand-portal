# Live-store readiness review — October 13, 2026

Thomas identified `16e80f-5b.myshopify.com` as the live store and wants a small
participant group only after controlled real-checkout validation. No invitations,
real purchase, app installation, permission expansion, or store configuration
changes were made in this review.

## Observed live configuration

Read-only Shopify admin review confirmed Analog Adventures, storefront
`analogadventureco.com`, and customer-account URL
`https://shopify.com/71081951487/account`.

- An app named `analog-adventures-brand-portal` is installed, dated August 27.
  Its installation page shows product permissions and no activity in the last
  30 days. Its identity/version/backend are not yet established. This differs
  from the tested development app `analog-adv-brand-portal`; do not assume the
  tested release is installed or uninstall the existing app without investigation.
- Shopify Payments shows accepting payments and receiving payouts. Payment
  capture is set to automatically at checkout. No test-mode conclusion is drawn
  from that summary alone; advanced settings and the actual checkout need review.
- Customer accounts and sign-in links are enabled. The portal extension's
  installation, publication, company memberships and customer access remain to
  be verified for this store.
- General shipping covers all products, one location and two zones. Pickup is
  on; local delivery is off. Exact product weights/rates, organizer delivery,
  address behavior and destination eligibility remain checkout test items.
- Shopify tax services are active and the United States row uses Shopify Tax.
  This is a configuration observation, not tax-registration or tax-accuracy
  validation; actual pilot product/destination totals remain unverified.
- Automatic order fulfillment is disabled; automatic archive after fulfillment
  and payment/refund is enabled.

## Confirmed implementation blockers

The tested code intentionally pins automatic reconciliation to
`analog-adventures-test.myshopify.com` in
`app/lib/order-reconciliation.server.js`. The staff reconciliation loader/action
also restricts the feature to that store in `app/routes/app.attributions.jsx`.

The scheduled portal backup client is pinned to the same development store and
app identity in `scripts/recovery/portal-client.mjs`; scheduled portal capture
also guards the existing artwork bucket and accepted development baseline.
The database backup guards its existing database identity separately.

Therefore development-store backup, reconciliation and alert successes do not
establish protection for the live store. Simply installing an app or changing a
single store string would not complete the rollout. Preserve development
coverage and establish explicit live-store identities, storage scope, backup
baseline, recovery evidence and independent monitoring before real checkout.
Do not reuse accepted historical test-data gaps as a live-store baseline.

## Rollout gates

1. Identify the existing live app and choose a supported installation/upgrade
   path for the tested code; preserve existing live records and settings.
2. Prepare explicit live-store configuration for app authentication, customer
   extension, company membership, private artwork, order reconciliation and
   paired backups. Review any new access or cost before activation.
3. Verify live-store customer isolation and capture/restore a pre-purchase
   baseline, with no unexplained live-data gaps.
4. Select one pilot product/campaign, buyer and delivery destination. Review the
   exact checkout total and payment/refund fees with Thomas before purchase.
   Validate individual shipping and bulk delivery as applicable; do not claim
   both delivery paths from one order.
5. Run the approved real checkout through artwork approval, immutable order
   attribution, production/fulfillment, agreed refund, payout reporting and
   archive. Distinguish a paid statement from a real organization funds transfer.
6. Independently restore the final live test records and artwork, confirm
   monitoring, and document Thomas's acceptance before inviting participants.

No new paid service is proposed or provisioned by this review. The development
rehearsal evidence remains valid within its recorded scope.
