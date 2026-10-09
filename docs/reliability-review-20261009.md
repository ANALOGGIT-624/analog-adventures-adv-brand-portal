# Reliability and access review — October 9, 2026

## Automatic backups

Render showed scheduled successes on October 2, 4, 6, 7, 8 and 9. October 3 and
5 failed after their PostgreSQL archive had been uploaded and verified; both
logged a non-retryable streaming request during the portal archive stage.
Today's 08:00 UTC run completed at 08:02:25 UTC. The portal archive verified
162 objects with 36 Shopify records, seven portal records, 11 orders, four
companies, 16 drafts, four R2 objects, 32 Shopify files and 35 downloaded assets.
Its capture reported ten known gaps. Historical gaps remain unresolved; a green
run and a smaller gap count do not establish historical recovery.

The transfer helper now reopens the same sealed file for up to three attempts
on recognized transient upload failures. Every object still requires read-back
hash verification; permission failures and integrity mismatches fail the run.
The completion marker remains last. No backups are deleted or pruned.

## Order delivery findings and repair

Regression tests reproduced three failures in the previous handler:

- A missing offline session returned HTTP 200 without processing the order.
- A delayed notification for an order placed while a campaign was open was
  discarded after that campaign closed.
- Duplicate delivery after another artwork approval replaced the order's proof
  snapshot with the newer proof.

The handler now returns 503 for missing sessions, preserves existing verified
attribution, and writes a new manifest with Shopify's atomic create-only
`compareDigest: null` guard. A losing concurrent delivery fails and can retry
without overwriting the winner. Partial historical attribution fails for review.
Closed/archived campaigns are evaluated against the order's creation time, and
individual orders require an approved proof whose review time precedes the
order. Missing reference data or unprovable approval times fail rather than
silently acknowledging lost attribution. Bulk orders retain their checkout
snapshot. No payment, refund, fulfillment or payout actions are replayed.

Webhook session renewal now uses the same per-shop coordination lock as staff,
customer and backup access. The official SDK validates the HMAC before the lock
and authenticates again inside it. Invalid signatures cannot acquire the lock.

Existing order definitions in `shopify.app.toml` are reused; no definition,
permission, schema migration, service or capacity changes are needed.

## Validation

198 tests passed (one opt-in PostgreSQL test skipped; its existing lock path was
verified against PostgreSQL on October 1). New tests cover late and duplicate
orders, concurrent create-only writes, missing sessions/references, historical
proof selection, real SDK webhook/customer renewal, and interrupted uploads
with a fresh stream. Production build, targeted ESLint and Shopify GraphQL
2026-07 validation passed.

## Deployment and live checks

Pending deployment and read-only/duplicate-delivery checks on the development
store. The separate live store is outside this change.

## Remaining acceptance work

A second real customer sign-in is needed to finish company-isolation testing.
Simulated company authorization and private-download denial tests pass, but do
not substitute for that hosted check. A durable webhook queue/reconciliation
path for deliveries missed beyond Shopify's retry window is still unproven;
this repair does not provide one. Historical payout-rule edits, missing approval
history, and reference sets beyond the current query limits need explicit
operating constraints or further hardening before a broader rollout.

Remaining overall pilot gates also include hosted replacement/cutover recovery,
retention and credential ownership, acceptance of historical synthetic-data
gaps, and the actual pilot store/setup decision. The R2 app credential remains
due for rotation by October 24.

References: [Shopify webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
and [atomic metafield writes](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/metafieldsSet).
