# Customer isolation verification — October 9, 2026

The controlled hosted portal authorization checks passed at 19:55 UTC against
`analog-portal-pilot.onrender.com`, using the separate development store. No
application change or deployment was needed.

## Hosted checks

Eighteen assertions passed, including sixteen HTTP requests:

| Check | Result |
| --- | --- |
| Each existing customer reads their own portal | 200; exactly one organization each |
| Foreign organization/customer IDs supplied in query parameters | Returned only the authenticated customer's records in both directions |
| Foreign organization used for a new campaign request | 403 in both directions |
| Own organization combined with a foreign campaign | 403 in both directions |
| Test Company requests its own private proof download | 200; short-lived URL with 60-second expiry |
| Tot Time requests that same proof, with forged customer/company fields | 404; no download URL |
| Tot Time attempts to approve or request changes on Test Company's proof | 403 for both actions |
| Anonymous portal and artwork requests | 401 |
| Expired and invalid-signature tokens | 401 |

Successful portal reads and authorized/denied business responses used
`Cache-Control: private, no-store`. Tot Time returned one organization, four
campaigns and three statements, with no proofs or requests. Test Company returned
one organization, seven campaigns, four proofs and four statements, with no
requests. Foreign record IDs were absent from both responses after query tampering.
A before/after hash of all PostgreSQL portal business records was unchanged.
Tokens, signed URLs, credentials and customer details were not included in the
saved result. Evidence: `recovery-private/customer-isolation-result-20261009.json`.

## Method and limits

Direct hosted requests used locally signed, 90-second HS256 test tokens for the
two existing development-store customer IDs. They passed the hosted SDK's real
signature/expiry validation and used live company memberships. These tokens were
not obtained from Shopify browser sign-in: this verifies backend authorization,
not end-to-end Shopify token issuance. The real Tot Time Chrome session separately
showed only that company's portal data.

The first harness request returned 410 because the SDK rejects Node's default
bot-style User-Agent before authentication. Repeating with a browser-style header
reached the intended authorization checks; no app setting was changed.

All 51 existing portal authorization/private-artwork tests also passed. They
cover no-company customers, mismatched ownership chains, multipart upload denial
before storage, request-artwork ownership, and database-backed authorization.
There are no existing hosted request records or Tot Time proofs, so those fixture
variants were covered locally rather than claimed as live tests. Native Shopify
order-history authorization and deliberate sharing of an already-issued bearer
download URL were not tested. No security audit beyond this defined scope is claimed.

This closes the hosted portal cross-company denial gate for the tested pilot
fixtures. Backup provider status, missed-webhook reconciliation and the other
operational pilot gates remain separate.
