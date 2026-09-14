# Analog Adventures Brand Portal extension

This full-page New Customer Accounts extension gives approved organization
contacts access to their organization stores, active campaigns, and payout
statements.

## Configuration

1. Deploy the app and extension.
2. In Shopify's checkout and accounts editor, add **Brand Portal** to customer
   accounts and include it in the account menu.
3. Set **Portal API URL** to the hosted app URL ending in `/public/portal`.
4. Approve network access and protected customer-data access.
5. Test with a customer who is a contact for a Shopify Company referenced by an
   `aa_organization_store` entry.

The backend verifies Shopify's customer-account session token and derives the
customer and company server-side. The extension never accepts organization or
payout identifiers supplied by the browser.

Customer account extension documentation:
https://shopify.dev/docs/api/customer-account-ui-extensions/2026-07
