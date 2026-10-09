# Shopify attribution investigation — October 9, 2026

Prepared technical evidence; no support message has been sent.

## Scope

Development store `analog-adventures-test.myshopify.com`, app
`416064569345` / client `8158f984f0ec6fed1e5f85b44a588777`.
The separate live store is outside the investigation.

## Confirmed facts

- October 2 08:00 UTC encrypted offsite archive, independently hash-verified and
  decrypted: ten of eleven orders have verified app-owned attribution. The
  remaining ordinary order was already unattributed.
- October 9 14:58 UTC archive: the same eleven order IDs and their checkout tags
  remain, but all attribution manifests/status values return null. Current API
  reads corroborated this, including explicit `$app` namespace access.
- The user reports no known uninstall/reinstall or custom-field changes.
- App identity matches the archive. The current installation ID is consistent
  across today's calls; older identity exports do not contain installation IDs.
- Active version 5, released October 1, declares all five order metafields.
  Version `attribution-recovery-20261009` / `1161551904769` preserves that
  configuration and was released without allowing deletions. Its declarations
  still do not appear in the installed store's complete order-definition list.
- Recovery used the verified October 1 19:14 UTC archive after checking exact
  order IDs, creation times, line IDs and checkout tags. Fifty missing values
  were created atomically, guarded against overwriting any existing value.
  All values read back correctly. A recovered metafield's `definition` is null.
- Duplicate webhook checks preserve the recovered snapshots. Backup monitoring
  now detects retained checkout tags without complete verified attribution.

## Open questions for platform investigation

1. Why do the declared order definitions not resolve as attached definitions on
   the installed store, despite the active released configuration?
2. Can Shopify identify any value/definition removal or preview-state transition
   between October 2 08:00 UTC and October 9 14:58 UTC?
3. What non-destructive operation reconciles released declarations with the
   installed store without clearing any existing values or other definitions?

Do not uninstall the app, delete definitions, or run preview cleanup as a
troubleshooting step. Preserve existing archives and the private recovery journal.
No passwords, tokens, order/customer payloads, or private artwork are included here.


## Definition mismatch resolved

A description-only change to each of the five existing order declarations was
validated and released as `attribution-definition-sync-20261009` /
`1161575858177`. Keys, types, access, scopes and URLs were unchanged; deletion
was disallowed. Direct lookup then returned the manifest definition, and a full
list returned all five definitions. The monitor query independently verified all
five expected types and `MERCHANT_READ` access. All 50 recovered values were
re-read and matched the immutable archived values. A no-change release had not
reconciled the missing installed definitions, but an actual description update did.

The current mismatch and non-destructive repair questions are resolved. The
original removal event is still unknown. Shopify documents asynchronous removal
of retained values following definition deletion. This is a plausible mechanism
for delayed disappearance, not proof of the cause in this store:
https://shopify.dev/docs/apps/build/metafields/definitions

Backup capture now saves direct order-definition lookups and flags missing
schemas, changed types or changed admin access as new coverage gaps. No new
historical gap has been accepted. No support message has been sent.
