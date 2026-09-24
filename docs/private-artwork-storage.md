# Private artwork storage and rollout

September 24, 2026: created `analog-brand-portal-private` in the existing
Cloudflare account. Public custom domains are absent and r2.dev is disabled.
The existing `analog-adventure-uploads` bucket remains public through
`files.analogadventureco.com` and is bound to the `engraving-upload` Worker.

The implementation in this checkout routes new staff proof and customer request
uploads to private R2. It has not been deployed to Shopify or a production host.
Legacy Shopify-hosted files retain their existing links until migration is
verified. Issue #25 remains open until rollout and legacy retirement pass.

The adapter writes immutable UUID objects, preserves the content hash, fixes
the destination bucket server-side, forces attachment downloads and issues
60-second signed GET links. It has no public-storage fallback. Signed URLs are
bearer links reusable until expiration, not single-use or immediate revocation.

Server-only configuration required (no values should enter source control):

- `ARTWORK_R2_ACCOUNT_ID`
- `ARTWORK_R2_BUCKET=analog-brand-portal-private`
- `ARTWORK_R2_ACCESS_KEY_ID`
- `ARTWORK_R2_SECRET_ACCESS_KEY`

The user created the scoped account credential on September 24. The dashboard
confirmed it applies only to `analog-brand-portal-private` and expires October
24, 2026. Keys are saved in this checkout's `.env.artwork` (Git-ignored, file
mode 0600). They are not installed in the original checkout or a production
host. Configure rotation/replacement before that date when deploying.

Run the opt-in synthetic integration test with:

```sh
node --env-file=.env.artwork scripts/verify-private-artwork.mjs
```

It uploads synthetic SVG bytes, compares an authorized download, rejects
unsigned/tampered requests, waits for link expiry, then removes its own object.
It never reads or migrates customer files. A live R2 rejection of an unsigned
request can be HTTP 400; the test also checks it did not return file contents.

Use a bucket-scoped Object Read & Write credential. Cloudflare credential
creation requires user confirmation. Keep secret values in a local ignored
environment file or the selected production host's secret store.

## Authorization and metadata

The app-owned proof/request metaobject holds the private UUID, filename, MIME
type, SHA-256 and upload timestamp. Its existing shop, company, organization
and campaign relationships form the durable authorization record. The object
key contains a hash of the canonical Shopify shop and an immutable UUID; it
is never accepted from a caller. Order and bulk-draft snapshots preserve the
private UUID alongside the proof version/hash and any legacy file ID.

Customer POST `/public/artwork` verifies the Shopify session and current
company membership, then resolves the proof/request and its organization and
campaign by ID. Staff GET `/app/artwork` authenticates the Shopify admin and
checks the same record relationships. Customer UI prepares links on demand;
staff and production views use the authenticated route. Responses are no-store.
The storage adapter alone is not an authorization boundary.

## Verified September 24, 2026

- 143 automated tests pass, including actual customer upload/download route
  handlers, removed membership, wrong organization, mismatched campaign,
  foreign app-owned records, immutable object keys and preserved references.
- Application lint, application and extension type checks, application build,
  Shopify configuration validation and Shopify component validation pass.
- Live R2 synthetic test passed: matching bytes, attachment response, unsigned
  rejection (400), tampered signature rejection (403), expired link rejection
  (403). Its own synthetic object was deleted in cleanup.

## Test-store rollout

1. Load the four R2 variables into the server environment from the ignored local
   file, or the deployment host's secret store. `.env.artwork` is not loaded by
   the application automatically. Do not put values in extension settings.
2. Apply the canonical app configuration and run the matching server/extension
   against Analog Adventures Test. Preserve existing development preview data;
   do not run `shopify app dev clean`.
3. Upload one synthetic customer request and one synthetic staff proof. Confirm
   no Shopify File is created and each stored private UUID resolves correctly.
4. Test staff and the owning organization, a second organization, removed
   membership and an expired link. Confirm historical proof and production
   snapshot downloads retain the original bytes after a new proof version.
5. Complete migration below before claiming all source artwork is private.

## Legacy migration and recovery

Inventory requests, all proof versions, order/bulk snapshots and completed
production batches that reference Shopify Files. Produce a dry-run mapping of
legacy file ID, owners, private UUID and hash. Copy and verify bytes before
writing private references; preserve original timestamps, versions and approval
states. Keep a legacy-ID mapping for immutable historical snapshots. Review
shared file references before retiring any public copy, then verify its old
URL no longer serves artwork. No customer files have been migrated or deleted.

An upload followed by a failed or ambiguous Shopify write can leave an orphan.
Reconcile R2 inventory against Shopify references before any cleanup: a failed
response does not prove the Shopify write failed. Do not delete automatically.
Backups must preserve both artwork and its Shopify metadata/mapping. Rolling
back to the old app cannot display new private-only records, so retain a
compatible download handler during rollback. No automatic retention policy
has been added.

References: [Cloudflare SDK integration](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/),
[signed URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
