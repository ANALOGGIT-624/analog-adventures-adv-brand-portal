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

Commit `535372f` is live on the existing web service (deploy
`dep-db4fnth42hec73b56mqg`) and backup worker (build
`bld-db4fo6flk1mc73ft22q0`). No new service or charge was introduced.
The manual verification run finished at 14:59:17 UTC. Its PostgreSQL upload
encountered a real interrupted stream, reopened the file and succeeded on attempt
2/3. PostgreSQL and portal archives passed read-back verification. The portal
archive contained 162 objects with the same counts listed above. Independently
downloaded all 162 encrypted objects, verified their hashes, and decrypted 159
files successfully using the separately held recovery key.

The actual Tot Time Preschool contact signed in through Chrome. The hosted
portal showed one organization (Tot Time), its four closed campaigns and three
draft statements; Test Company's organization, proofs and paid statements were
absent. This verifies normal signed-in display isolation, not every adversarial
cross-company request. Existing authorization tests provide separate evidence.

### New blocking finding: missing order attribution

All 11 currently accessible orders return no attribution manifest/status. Ten
of them had verified attribution in the October 1 independently restored backup;
#1006 was already unattributed. The original order IDs, line IDs and checkout
attribution tags match between those archived and current records. The current
October 9 archive independently reproduces the missing fields. A direct #1010
query also found no metafields, including with an explicit `$app` namespace.
The user reports no known uninstall/reinstall or custom-field changes.

This is not proof of when or why the fields disappeared. No order mutations or
webhook replays were made during this review: the replay helper stopped at its
preflight check. Preserved backup manifests make a guarded recovery possible.
Private comparison evidence and a per-order recovery plan are stored outside
Git in `recovery-private/attribution-recovery-plan-20261009.json`.

The green backup signal proves transfer/decryption and the configured baseline,
not attribution completeness. The existing baseline checks record counts and
known reference gaps; it did not detect the missing attribution fields. Before
pilot: investigate app/definition history, recover only proven missing fields
with atomic create-only guards, add signed-order attribution coverage alerts,
and repeat the hosted duplicate-delivery check. Do not silently accept this as
a new baseline. Historical snapshots must not be rebuilt from today's proofs.
The separate live store remains outside this change.

## Remaining acceptance work

The real second-company display check passed as described above. Direct hosted
cross-company denial checks remain distinct from that result. A durable webhook queue/reconciliation
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


## Recovery follow-up — October 9

Recovered all ten affected orders from the independently restored October 1
19:14 UTC archive. Preflight matched order IDs/names/creation times, line IDs and
checkout tags, and proved all five target fields absent on each order. Each
atomic `metafieldsSet` call used `compareDigest: null` on all five fields. The
manifest and original verification timestamp were preserved; organization,
campaign and payout-rule index fields were derived from those archived lines
using the existing one-or-multiple rule. All 50 fields passed read-back checks.
PostgreSQL portal and checkout records remained unchanged. Private per-order
hashes/results are in `recovery-private/attribution-recovery-journal-20261009.json`.

Four signed duplicate notifications (two each for #1010 and #1011) returned HTTP
200 in 217–476 ms. Stored attribution and database business records were unchanged.
No purchase, refund, shipment or payout was performed by this replay.

Shopify version `attribution-recovery-20261009` (`1161551904769`) was built,
inspected and released with deletion-disallowing flags. Its configuration content
matches the previously active version 5 (including scopes, URLs and all custom
data definitions). Local hosted TOML validation passed. The app ID matches the archived identity; the installation ID stayed consistent
during today's diagnostic calls (the older identity export does not include it). Both filtered and complete order-definition listings
omit the five app-owned definitions; a restored field's `definition` is null.
Thus definition presence in the released configuration does not establish an
attached store definition. Releasing identical configuration did not resolve that
mismatch. Do not attribute the disappearance to a user action or a specific
Shopify operation without additional evidence. An independently downloaded/decrypted October 2 08:00 UTC archive still has all
ten verified manifests and no attribution coverage gaps. The observed missing
snapshot is October 9 14:58 UTC, narrowing the confirmed interval to October 2–9.
Orders were still attributed after the October 1 release.

Backup capture now reports `missing_order_attribution` for tagged orders without
a verified nonempty manifest, and `incomplete_order_attribution` when a tagged
line is absent from the manifest. The existing monitor's unaccepted-gap rule
makes these unhealthy. Ordinary untagged orders do not fail. The real October 1
archive yields zero such gaps; the October 9 pre-recovery archive yields ten.
199 tests pass (one opt-in PostgreSQL test skipped); targeted lint passes.
This checks accessible orders with retained tags; it does not prove recovery of
older inaccessible orders or detect simultaneous loss of both tags and metadata.

Backup worker commit `0ebaf63` built successfully as
`bld-db4hqa2d0e5s73cd4krg`. The post-recovery portal run reported verification at
17:03:14 UTC, with 162 objects and 13 accepted historical gaps. The return from
ten to thirteen known gaps reflects restored historical references; it is not
newly lost data. Attribution completeness passed the new check. The PostgreSQL
stage separately verified five objects. A delayed dashboard response prompted
a second manual trigger; Render canceled the earlier attempt. The second run
produced the verified archive. Independent archive read-back is recorded below.
The definition mismatch and cause investigation remain pilot acceptance items.


Independent post-recovery verification downloaded all 162 encrypted objects,
verified transfer hashes, and decrypted 159 files. All ten recovered attribution
manifests/status values exactly match the October 1 archive. The new capture has
zero attribution gaps, healthy coverage, and the 13 explicitly accepted historical
gaps. Evidence: `recovery-private/attribution-recovered-verification-20261009.json`.
The backing archive prefix is
`recovery/postgresql/scheduled/portal/2026-10-09T17-02-06.887Z-bb26c8bb-1716-48a4-a699-dfdf9506c6f2/`.
See [the prepared platform investigation note](shopify-attribution-investigation-20261009.md)
for the remaining definition/disappearance questions. No support message was sent.
