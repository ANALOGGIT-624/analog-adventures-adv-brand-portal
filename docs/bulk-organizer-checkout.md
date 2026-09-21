# Bulk-to-organizer checkout

Bulk campaigns use a separate Shopify draft-order invoice checkout. Buyers select one variant per product and quantities (0–100 per product, at most 50 selected products). Existing ordinary-cart items are not included. Individual-shipping campaigns continue through the ordinary cart.

Staff saves an organizer address under Organization stores → Bulk delivery addresses. The app-owned `organizer_delivery` definition is installed from `shopify.app.toml`. Its address is read through Admin API and is not added to the public storefront markup. Missing/invalid addresses block bulk purchases. Address edits affect new drafts only.

The server verifies proxy authentication, the signed checkout token, live store/campaign relationship, product membership, variant availability, tracked inventory and quantity. It creates real variant lines with Shopify pricing/tax behavior, a custom $0 shipping line, and the organizer address. Buyer contact and billing information are collected at checkout; the organizer is not assigned as the purchasing customer. Organizer shipping charges are handled separately outside this checkout.

Repeated submissions reuse the saved invoice. A database uniqueness constraint prevents concurrent duplicate creation. Unknown mutation outcomes stay blocked rather than blindly creating another draft; staff should inspect Shopify Drafts before instructing a customer to reload and create a fresh checkout. Explicit Shopify validation errors permit retries.

A private database record stores the campaign/payout/proof snapshot at draft creation. The order webhook verifies Shopify's draft-to-order relationship before using that snapshot. This preserves attribution for invoices paid after campaign close, but does not cancel outstanding invoices when a campaign closes. Staff must delete unpaid drafts in Shopify if they should no longer be payable. No inventory reservation is created; Shopify checkout remains the final inventory gate. Address corrections to an existing draft must be made in Shopify.

## Update and test

1. Pull the merged branch, run `npm run setup`, then `shopify app config validate --json` and `shopify app dev` using the canonical config. Keep the CLI running so order webhooks reach the app.
2. Save the test organization's address in Organization stores → Bulk delivery addresses. Refresh; confirm it persists.
3. Open a live bulk campaign storefront. Select quantities and continue to checkout.
4. Confirm $0 shipping, organizer destination, no destination/rate changes, and buyer's own billing/contact information. Use test payment only.
5. Verify the paid order in Shopify and the app's Attributions page. Verify campaign, organization, quantity, proof version and payout/report totals.
6. Confirm its unfulfilled lines appear in the campaign production queue and retain bulk-to-organizer fulfillment mode.
7. Double-click/retry the same submission and confirm there is only one draft. Verify ordinary cart contents were not included.
8. Test missing address, closed campaign and unavailable quantity. None should create a checkout.
9. Test an individual-shipping campaign: regular cart and shipping behavior should remain intact.

Local automated tests mock Shopify responses. Live checkout, webhook delivery, and plan behavior still require the development-store tests above. Keep database backups; bulk attribution snapshots depend on this database.
