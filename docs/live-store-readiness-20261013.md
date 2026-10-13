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

## Implementation preparation — October 13

Developer Dashboard confirmed live app registration `416059686913`, client ID
`06e65ab0c39620391d34ec284f2b61aa`, under Analog Adventures. Its sole active
version `1106020794369` (`analog-adventures-brand-portal-1`) points at Shopify's
default app-home/auth URLs and has only `write_products`. It is a placeholder,
not the tested hosted portal. The existing registration can be prepared for a
live deployment; uninstalling it is not required by this finding.

Prepared, but **not deployed**:

- `shopify.app.live.toml`, reusing the tested configuration with the verified
  live client ID and proposed `https://analog-portal-live.onrender.com` host.
  That hostname is not provisioned or verified and must match actual hosting.
- Explicit development/live deployment profiles. Development remains default;
  unknown profiles and mismatched app credentials/URLs fail identity checks.
- Reconciliation reads/writes the selected store's checkpoint and processes only
  that profile's store. Preview/recovery URLs do not start its background writer.
- Live backup capture selects the live app/store, a separate private artwork
  bucket, a separately reviewed baseline, and no seeded development historical
  record ID. The database export requires `analog_portal_live` and an explicit
  provisioned Render database host. Existing development database guards remain.
- Daily pairs and monthly copies use a separate live backup subtree and reject
  mixed development/live archive sources. No deletion or expiration is added.

Proposed live identities: R2 bucket `analog-brand-portal-live`; B2 subtree
`recovery/postgresql/scheduled/live/16e80f-5b/`; database `analog_portal_live`.
These are configuration proposals, not created resources or granted permissions.
The extension already reads its API URL from its customer-account editor
setting; the live installation must set that to the live backend. Shopify's
UID mapping guidance permits the same app-scoped extension UID across separate
app instances; inspect the first live CLI deployment mapping before release.

Validation: full suite passed 232 tests with one optional PostgreSQL test skipped;
production build and targeted lint passed. An additional live database identity
regression and focused scope/backup tests passed afterward. Shopify CLI live
TOML validation, extension build/mapping, and live deployment remain pending.
No claim is made that live-store rollout or protection is active.

Thomas selected separate live hosting and preparation of its full cost proposal.
No paid service creation is authorized by this selection. After cost approval,
present exact resources/costs and the specific new credential/data access for
approval, then validate/deploy, confirm live backup recovery and monitoring,
and proceed to the controlled real-checkout gates above.

References: [Shopify extension UID mapping](https://shopify.dev/docs/apps/build/dev-dashboard/migrate-from-partners)
and [Render pricing](https://render.com/pricing).

## Separate live hosting cost proposal — October 13

Proposed resources in the existing Render workspace, Ohio region:

| Resource | Proposed configuration | Monthly USD |
| --- | --- | ---: |
| `analog-portal-live` | One Starter web app, 512 MB | $7.00 |
| `analog-portal-live-db` | Basic PostgreSQL, 256 MB | $6.00 |
| Database storage | 5 GB at $0.30/GB; no automatic expansion | $1.50 |
| `analog-portal-live-backup` | Separate daily Docker cron job | $1 minimum; budget $2 |
| Private credential settings | Environment settings on the above services | No separate service |
| Healthchecks | Three live checks within existing free account's 20-check limit | $0 if capacity available |

Expected Render subtotal is $15.50–$16.50/month before taxes and usage overages.
Propose a $20/month incremental operating budget for the small live pilot,
including ordinary storage usage. This is a planning budget, not an enforceable
provider billing cap. Reconfirm plan prices in the creation forms before purchase.
Do not create a paid workspace upgrade, Redis service, disk, extra app instance,
or paid monitor as part of this proposal.

Use a separate private R2 Standard bucket `analog-brand-portal-live` and a
separate B2 backup prefix `recovery/postgresql/scheduled/live/16e80f-5b/` in the
existing account. R2 is $0.015/GB-month beyond its account-level free allowance,
plus request charges. B2 currently lists $6.95/TB-month (about $0.695 for 100 GB),
with download charges beyond its allowance. Free allowances are shared with
existing usage, not newly granted per bucket. Render bandwidth overage is also
variable. Daily copies and retained monthly copies accumulate: the retention
policy does not currently enable automatic pruning.

The documented development app/database cost remains $14.50/month plus its
$1–$2 backup job. Keeping both environments means approximately $31–$33/month
in Render service/storage charges before variable usage, tax, or any retained
recovery-resource charges. This is not a verified account invoice total.
Shopify subscription/payment fees, real test-purchase totals and any temporary
paid recovery resources are outside this infrastructure proposal and require
separate review. No additional fixed-price service is currently identified as
necessary for this pilot; growth or new requirements may change that.

Sources checked October 13: [Render pricing](https://render.com/pricing),
[cron billing](https://render.com/docs/cronjobs),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Backblaze pricing](https://www.backblaze.com/cloud-storage/pricing), and
[Healthchecks free account limits](https://healthchecks.io/docs/api/).

Next gate: approve the concrete hosting spend, then provision isolated resources
and obtain approval for the specific live credentials/access before connecting
Shopify or copying live data. No services were created by this proposal.

## Hosting approval and provisioning — October 13

Thomas approved the additional $20/month operating budget and creation of the
live app, database and backup job. Created `analog-portal-live-db`, service
`dpg-db75212j9qps73b7gu6g-a`, PostgreSQL 18 in Ohio, database
`analog_portal_live`. Verified the plan is $6 compute with 5 GB storage ($1.50),
and storage autoscaling is disabled. Removed its public inbound rule and saved
the explicit block-all-internet setting. No existing database was modified.

Prepared, but did not submit, the $7 live web app form with the existing GitHub
repository, `codex/durable-hosting`, `Dockerfile.postgresql`, `/health`, auto-deploy
Off, and `npx prisma migrate deploy --schema prisma-postgresql/schema.prisma`
as the pre-deploy command. App and backup job creation remain pending the
specific credential/access approval needed to configure them successfully.
No live Shopify secret has been copied; no live Shopify permissions or routing
have been changed. The new database is not yet populated or backed up.

### Approved credential configuration and successful hosting

Thomas subsequently approved storing the new database connection and existing
live Shopify app secret in the live app and separate backup job's private Render
settings. Configured both with the live profile and TLS database connection.
No secrets are included in these notes or Git.

- Web app `srv-db754d3ncjis73fhve60`, `analog-portal-live`, $7/month, Ohio:
  deployed commit `d362a1c` successfully at 11:47 EDT. URL confirmed as
  `https://analog-portal-live.onrender.com`. Both PostgreSQL migrations applied
  successfully; runtime `/health` returned 200. Auto-deploy is Off.
- Backup job `crn-db754sbl550s73aq5jtg`, `analog-portal-live-backup`: created with
  `Dockerfile.backup`, same branch, smallest 512 MB compute ($0.00016/min,
  $1/month minimum), daily `0 8 * * *`, auto-deploy Off. Database and Shopify
  credentials saved as approved; exact database-host guard configured.
- Suspended the new backup job until B2/R2 credentials, public recovery key,
  baseline and monitoring are configured and verified. Dashboard confirms
  suspended. No successful live backup or restore has occurred.

Hosting health does not establish Shopify authentication, artwork access,
customer isolation or checkout readiness. Shopify permissions, application URLs
and customer extension routing remain unchanged. Next work is private live
artwork storage and offsite backup access, monitoring, Shopify configuration
validation/release, authentication, baseline capture and recovery verification.

### Live artwork storage — October 13

Created private R2 Standard bucket `analog-brand-portal-live`, public access
Disabled. Thomas approved two 30-day bucket-only account keys: Object Read &
Write for the live app and Object Read only for its backup job. Both expire
November 12, 2026. Saved each in its respective service's private environment.
App environment deployment `dep-db75ammk1f9s73c9ci8g` started the new instance
`vsbz5`. A hosted synthetic upload followed by exact-content download passed
using the app's actual runtime credentials. Retained the non-sensitive test
object `verification/hosting-20261013.txt`; no business record was created.
Backup key has been saved but its read-back verification is still pending.
Backblaze requires a fresh owner sign-in. Live offsite backup remains suspended
and unverified; Shopify routing remains unchanged.

### Backblaze access discrepancy — October 13

Created the owner-approved `portal-live-backup-20261013` key, restricted to
`analog-adventures-portal-backups` and `recovery/postgresql/scheduled/live/16e80f-5b/`,
90 days (expires January 11, 2027). The resulting dashboard capability list
unexpectedly includes `bypassGovernance`, `writeBucketRetentions`,
`writeFileRetentions` and `writeFileLegalHolds` in addition to the previously
 disclosed read/write/delete and bucket configuration capabilities. The key was
NOT saved to Render or used. Live backup remains suspended. Request revocation
of only this unused key and prepare a Native API key limited to list/read/write
file operations; that path requires an authorized key-management credential.
Do not generate/rotate the master key casually. Existing development key and
backups are unchanged. Official capability selection reference:
https://www.backblaze.com/apidocs/b2-create-key

Thomas approved revocation of the unused broader key. Deleted only
`portal-live-backup-20261013` (`005737046624bfe0000000004`) and verified it is
absent from the Application Keys list. The existing development key remains.
The replacement should use Native API capabilities `listBuckets`, `listFiles`,
`readFiles`, `writeFiles`, with the same bucket/prefix and 90-day lifetime.
Creating it requires an existing credential with `writeKeys`; availability is
not confirmed. Do not request secrets in chat or rotate the master key without
reviewing dependencies. No live backup key is currently installed in Render.

### Restricted live backup credential installed

Created `portal-live-backup-restricted-20261013` through Backblaze Native API v4, key ID ending `0005`. API response verified exactly `listBuckets`, `listFiles`, `readFiles`, `writeFiles`, bucket `analog-adventures-portal-backups`, prefix `recovery/postgresql/scheduled/live/16e80f-5b/`, with 90-day expiry on January 11, 2027. No delete, retention modification, or governance bypass permissions. Saved key pair in the live Render backup cron environment. The user-generated master key was used only for creation; its temporary local transfer file was removed and it was not installed in Render. The dashboard did not display this v4-created key after refresh; API response is the current permission evidence. Live cron remains suspended pending monitoring/public encryption-recipient configuration and successful backup verification. No live backup success is claimed yet.

Public encryption recipient installed in the live cron; local cryptographic comparison confirms it matches the existing verified RSA-3072 recovery private key (SHA-256 public fingerprint `dd1c1901a1acb70a181719bba664c80a8e647d685ef47be390564609265f6271`). Private key was not uploaded. Healthchecks session requires user sign-in before dedicated live monitoring can be configured. Render Runs confirms suspended, deployed commit d362a1c, and no successful runs yet. Do not resume until monitoring configuration is saved.

### First live database backup verified — October 13, 12:41 EDT

Created dedicated Healthchecks monitor `Analog Adventures LIVE — PostgreSQL backup`, with existing email integration enabled, daily 08:00 UTC schedule and one-hour grace. Saved its private ping URL in live Render cron. Resumed approved service; build `bld-db75tvt9fdbs73f572i0` succeeded from d362a1c. First manual run completed successfully (33.4 seconds reported by Render). Logs confirm `backupVerified:true`, five objects, database stage complete, and `backupJobComplete:true,exitCode:0`.

Offsite prefix: `recovery/postgresql/scheduled/live/16e80f-5b/2026-10-13T16-41-45.232Z-27beca9d-3562-48cc-8992-16414ece87fb/`. Verification includes encrypted object upload/read-back hashes, authenticated decryption, and pg_restore listing of the downloaded database dump. Healthchecks explicitly reports up and email notifications ON. Daily database schedule now active at 08:00 UTC (4am EDT / 3am EST).

Scope remains PostgreSQL only. This run does not establish full running-database restoration, live Shopify/R2 coverage, monthly combined recovery sets, or live checkout readiness. Next: complete isolated live Shopify installation/configuration and live portal backup baseline, then full recovery and checkout gates before invitations.
