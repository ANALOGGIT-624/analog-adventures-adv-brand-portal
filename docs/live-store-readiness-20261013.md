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

### Live Shopify version prepared, not released

Owner approved CLI validation and unreleased deployment. `shopify app config validate --config=live --json` returned valid true with no issues. CLI automatically upgraded itself from 4.9.2 to 4.9.3. `shopify app deploy --config=live --no-release` built the customer extension and created `analog-adventures-brand-portal-2`, version ID 1165710786561, in live app 416059686913. Dashboard review confirms live Render app URL/auth callback, three live webhook destinations, community/stores proxy, one brand-portal extension, and prepared custom definitions/scopes. Version is not released. Activation requires owner confirmation of exact release command and resulting live routing/permission configuration; installation and access checks remain outstanding.

### Live version released; store access update pending

Owner approved exact release command. `shopify app release --config=live --version=analog-adventures-brand-portal-2 --allow-updates` succeeded; dashboard shows Active, released October 13 at 1:02pm. Existing live installation dates to August 27. Opening it now presents Shopify's Update permission screen: view customer personal/device data, customers, products/inventory/collections and companies; edit draft/recent orders, app-controlled Online Store content, custom definitions/records, and files. Update has not been clicked; action-time access approval requested. Customer-account extension was listed as 0 active before opening. Live application authentication, full backups and checkout tests remain pending.

### Live access update completed; schema gap identified

Thomas approved Shopify's store access update. Update succeeded and the embedded staff dashboard loaded in live store 16e80f-5b with the expected portal navigation. Dashboard reports four missing merchant-owned definitions: aa_organization_store, aa_store_campaign, aa_payout_rule, aa_payout_statement. Brand-kit and deployed app-owned definitions were not flagged. No organization/campaign/payout records created. Existing development backup contains the four schemas; any repair must remap reference-definition IDs to live IDs (brand kit, artwork proof, payout rule, organization, campaign), never copy development IDs or business records. Live customer-account placement, full Shopify/R2 backup and checkout gates remain outstanding.

### Live schema repair completed — October 13, 1:10pm EDT

Owner approved schema write authentication and the reviewed create-only repair. Four definitions created with no user errors: payout rule 24397480191, organization store 24397512959, campaign 24397545727, payout statement 24397578495. Brand Kit reference uses existing live definition 21041643775. All returned field types and reference validations match submitted variables. Storefront access was requested as NONE; merchant-owned admin default retained for compatibility. Omitted unused legacy campaign `proof` reference to aa_artwork_proof; current proofs use PostgreSQL. No business records copied or created.

Live embedded dashboard refreshed and explicitly reports “Required metaobject definitions found”; missing-definition warning is gone. Reviewed schema plan and create-only script retained in docs; private per-operation requests/results retained outside Git in recovery-private/live-rollout-20261013/schema-repair. Next gates remain live Shopify/R2 backup baseline and recovery, customer-account extension placement/isolation, pilot company/campaign/payout configuration, actual checkout/refund/fulfillment tests, then participant invitations.

### Live portal baseline capture prepared

Read-only capture on hosted live app completed with 12 metaobjects, 0 PostgreSQL portal records, 3 accessible orders, 2 companies, 8 drafts, 996 Shopify files and 1 R2 object. All 997 assets downloaded; temporary capture is approximately 1.04 GB on app ephemeral disk, not an offsite backup. Status captured_with_gaps: order_history_window and aa_brand_color count mismatch (reported 1, returned 2). Owner acceptance of this limited live baseline pending; do not reuse development exceptions. Separate live Shopify/R2 Healthchecks monitor created, not pinged/armed yet. Backup worker's actual R2 read-only credential successfully listed live bucket and read the exact synthetic verification object. Enabling combined backup and offsite recovery verification remain pending baseline acceptance. Proposed baseline and private monitor URL saved outside Git under recovery-private/live-rollout-20261013. Temporary capture /tmp/live-baseline-20261013 and key /tmp/live-baseline-key-20261013 remain on app instance for review/cleanup after offsite capture.

### Combined live backup enabled; temporary disk fix deployed

Thomas accepted the two live baseline exceptions. Saved live baseline, separate monitor, BACKUP_PORTAL_ENABLED=1 and BACKUP_MONTHLY_ENABLED=1 in cron. First combined run exported/verified PostgreSQL and captured 996/996 Shopify files but Render terminated it at 1:26pm: temporary /tmp volume exceeded its 2GB limit. This was not a verified portal backup.

Fix 7093592 releases disposable capture files after sealing, sealed local objects only after verified offsite read-back, and downloaded encrypted objects after verified decryption. Original Shopify/R2 data and offsite objects are not deleted. Recovery receipt is collected before disposable sealed files are removed. Defaults preserve files for ordinary recovery tooling. 39 focused backup/recovery tests passed, including failed read-back retaining source and disposable intermediate roundtrip. Live worker rebuilt successfully from 7093592; retry started about 1:31pm. Result pending.

### Daily live backup verified; monthly blocked by Backblaze usage cap

October 13 retry verified PostgreSQL at 1:31pm and Shopify/R2 at 1:41pm EDT. Portal receipt reports 1,087 encrypted archive objects, all 997 assets (996 Shopify files and one R2 object), 12 metaobjects, three accessible orders, two companies, eight drafts and zero portal records. Both owner-accepted baseline gaps remain. A transient streaming upload succeeded on its bounded retry. The temporary-disk fix worked.

Daily database prefix: `recovery/postgresql/scheduled/live/16e80f-5b/2026-10-13T17-31-36.623Z-b71e069a-82b4-4a9f-ace6-8aaf79bced9f/`.
Daily portal prefix: `recovery/postgresql/scheduled/live/16e80f-5b/portal/2026-10-13T17-31-40.527Z-898f508a-3847-40f7-83a7-d53fe5753141/`.

Monthly preservation failed and the overall job correctly exited 1 at 1:43pm. Independent retry could list the saved pair but its GET failed with HTTP 403 AccessDenied: “Cannot download file, download bandwidth or transaction (Class B) cap exceeded. See the Caps & Alerts page to increase your cap.” This identifies an account usage cap, not evidence that the restricted key needs broader permissions. No cap or credential permissions changed. Monthly recovery remains unverified and portal monitoring must not be manually marked successful. Backblaze session expired when opening Caps & Alerts; owner sign-in requested to inspect the precise cap and cost before proposing any change.

### Backblaze paid-account caps approved and saved

Owner added payment method and explicitly approved storage $0.02/day plus download bandwidth $0.10/day. Dashboard confirms saved limits equivalent to 96 GB storage and 11 GB daily downloads, with email alerts enabled. These are account-wide caps shared by development and live backups, not fixed charges or a guaranteed monthly billing ceiling. Nominal daily amounts total $3.72 across 31 days. Paid account no longer displays Class B/C free-tier transaction caps. Initial retry during propagation still returned 403; after approximately one minute, reading the daily pair succeeded and monthly preservation started. Result pending. No credential permissions expanded.

### October monthly live recovery copy verified

After approved caps propagated, the independent monthly retry completed successfully in 13 minutes 29 seconds. Result: monthlyCreated true, month 2026-10, prefix `recovery/postgresql/scheduled/live/16e80f-5b/monthly/2026-10/edd77399-110c-4dda-a55d-9c3cb2457192/`. The routine checked daily source hashes, copied database and portal encrypted objects, verified byte-for-byte read-back, and published the monthly COMPLETE marker last. This is archive integrity verification, not a new full running-database restoration test.

Healthchecks live Shopify/R2 details explicitly reports “This check is up”, with email integration ON, following the successful monthly retry's completion ping. No manual Ping Now was used. Latest displayed Backblaze download usage was 4 GB/$0.03, below the approved $0.10/day cap. Screenshot evidence: recovery-private/live-rollout-20261013/live-monthly-backup-verified.png and backblaze-approved-caps.png, outside Git. Original Render combined run remains failed in history; monthly repair ran in its Web Shell, so do not describe that original run as successful. Next full scheduled combined run still needs observation. Live recovery, customer access/isolation, and real checkout pilot gates remain open.

### Independent local recovery passed — October 13, 14:28 EDT

Downloaded the verified October monthly pair directly from Backblaze to an owner-only local directory using the existing restricted live key. All 5 database and 1,087 portal encrypted objects matched receipt hashes and authenticated decryption passed with the separately stored recovery private key. Portal restoration produced 1,084 files; catalog integrity/count checks passed for 12 records, 3 accessible orders, and all 997 assets. Two accepted gaps remain; there are zero proof snapshots in this pre-pilot baseline.

Restored database.dump into a newly initialized local PostgreSQL instance with TCP disabled and a private Unix socket. pg_restore completed with exit-on-error. All fields in BulkCheckoutAttempt, PortalRecord, Session and _prisma_migrations matched the source dump, including empty-table comparisons. The local database was stopped after verification. No restored app was started and no copied session credentials were used against Shopify. This establishes independent local database/file recovery, not replacement-hosting readiness or a real artwork workflow on the live store.

Evidence outside Git: live-rollout-20261013/independent-monthly-restore/VERIFIED.json, DATABASE-ALL-FIELDS.json, and portal/restored/DRILL-REPORT.json. Next: editor placement and two owner-accessible live customer accounts for isolation checks. Live dashboard currently reports zero organization stores/campaigns/proofs/payout rules; development fixtures are not live fixtures.

### Live customer-account page saved and first real sign-in verified

Added deployed Brand Portal full-page extension to the active customer-account configuration and saved its Portal API URL as https://analog-portal-live.onrender.com/public/portal. Shopify confirmed Changes saved. Page ID 01a13635-a6b0-74ec-99ec-cff76204bec9; no navigation menu link added yet. Editor simulation reported unable to load, but the real authenticated customer page loaded successfully and showed the appropriate unassigned-organization state.

Owner nominated tinroofholdings@gmail.com and oneil.thomasr@gmail.com for live isolation tests. Existing Chrome sign-in is the first account, confirmed via Profile; it belongs to Analog Adventures Test. Live store currently has no portal organization records. A second isolated test company/organization and test fixtures are needed before cross-company denial checks can pass. Do not use West Virginia Golf Association as an isolation fixture or grant test accounts access to it. Screenshot: live-customer-portal-unassigned-verified.png outside Git. Company/organization access changes remain pending specific confirmation.

### Approved live isolation fixtures created

Thomas approved two isolated assignments. Created draft Portal Isolation Test A linked to existing Analog Adventures Test company and organizer tinroofholdings@gmail.com. Created company Portal Isolation Test B (6833537279), location 8292434175, with existing customer oneil.thomasr@gmail.com as main contact; checkout submits orders as drafts for review. Created draft portal organization Portal Isolation Test B linked to that company. Both organizations remain unavailable to campaigns by default; no campaign, order, payment or real-company membership changed.

Real Chrome session confirmed tinroofholdings@gmail.com sees exactly Portal Isolation Test A, with B absent and zero campaigns/proofs/statements. Evidence: live-isolation-account-a.png outside Git. Signed out of this browser session only and requested owner sign-in as oneil.thomasr@gmail.com. Reverse visibility and cross-company write/private-artwork denial checks remain pending; this is not yet a completed isolation gate.

### Live organization isolation verified in both directions

Both real customer sessions now verified: tinroofholdings@gmail.com sees only Portal Isolation Test A; oneil.thomasr@gmail.com sees only Portal Isolation Test B. Profile pages confirmed each email. Saved separate screenshots outside Git.

Hosted controlled authorization harness passed 12 assertions (10 HTTP requests): both own-portal reads 200, forged foreign organization/customer query parameters returned no foreign records, foreign organization request writes rejected 403 in both directions, anonymous portal/artwork rejected 401, expired and invalid-signature tokens rejected 401. Authorized and business-denial responses used private/no-store caching. Before/after PostgreSQL PortalRecord hashes were identical. Harness used locally signed short-lived tokens inside the hosted app, separately from the genuine browser sign-in checks; no secrets or tokens logged. Result: recovery-private/live-rollout-20261013/hosted-isolation-result.json.

Scope: organization isolation only. Campaigns, private proofs, requests and payout statements are empty. Cross-campaign/write/private-artwork isolation remains open until populated fixtures exist. Campaign UI reports missing prerequisites (available organization, active payout rule, active product); requested owner choice of pilot product and payout terms before preparing unpublished campaign. No purchase authorized by these checks.

### Brass Ball Marker draft campaigns and picker repair

Owner selected Brass Ball Marker and approved a fixed $2-per-item payout. Created active rule LIVE-PILOT-BRASS-2USD v1, fixed_per_unit rate 2, revenue basis net_merchandise. Created draft campaigns LIVE-BRASS-A-20261013 and LIVE-BRASS-B-20261013 for the two isolated test organizations, selecting the exact product Brass Golf Ball Markers - Laser Engraved Golf Accessory. Both retain retail pricing, individual shipping and batch-after-close defaults; no live publication or purchase. Organizations remain draft but are available for campaign selection.

Campaign picker originally loaded only the first 50 active products, hiding the selected brass product. Fix 092d3af adds cursor pagination, deduplication, and explicit errors for partial/invalid results. Three regression tests passed, Shopify 2026-07 GraphQL validation passed, production build passed, and Render live app deployment succeeded at 14:54 EDT. Reopened form confirmed the exact brass product and both draft saves.

Prepared synthetic SVG proofs marked NOT FOR PRODUCTION outside Git. File chooser automation timed out in both IAB and Chrome, including direct file-input attempts. No proof upload succeeded; artwork isolation remains pending. Browser upload setup/user file selection is the immediate blocker. Existing organization isolation results remain valid for their earlier empty-campaign scope, not evidence of populated campaign/proof isolation.

### Populated live campaign/private-artwork isolation passed

Native Chrome picker successfully attached synthetic proof A; owner completed B selection after the native path dialog stalled. Both SVGs labeled NOT FOR PRODUCTION uploaded through staff UI as Version 1 for their matching draft campaign. No real production artwork or purchase involved.

At 19:07 UTC, hosted bidirectional harness passed 22 assertions, with one organization/campaign/proof per account. In both directions: forged foreign identity queries leaked no foreign records; foreign organization and campaign requests returned 403; own artwork download-link issuance returned 200 with 60-second expiry; foreign download returned 404 without a URL; foreign proof approval/change requests returned 403. Anonymous and invalid/expired credentials returned 401. PostgreSQL PortalRecord hashes unchanged. Harness used short-lived locally signed tokens inside live hosting, while actual Shopify browser sessions independently verified customer identity/visibility. Download byte integrity and successful customer approval are separate workflow checks, not claimed by URL issuance.

Evidence: hosted-bidirectional-isolation-summary.json and live-customer-b-private-proof.png outside Git; repeatable harness hosted-bidirectional-isolation-check.mjs also outside Git. Full report remains /tmp/live-populated-isolation-result-20261013.json on app instance. Request and payout-statement fixtures remain empty; their populated variants are not claimed tested. Live company/campaign/private-proof isolation gate passes for these scoped fixtures. Both campaigns remain draft. Next: customer approval/download workflow, fresh backup/recovery of the new proofs, then exact checkout total approval and controlled real purchase.

### Customer approval and fresh recovery in progress

Approved synthetic proof B through the real oneil.thomasr@gmail.com customer session. Reloaded customer and staff pages both show approved. Campaign remains draft and SVG remains labeled NOT FOR PRODUCTION. Captured live-proof-b-approved.png outside Git.

Triggered combined live backup at 15:10 EDT. PostgreSQL verified at 15:11, prefix recovery/postgresql/scheduled/live/16e80f-5b/2026-10-13T19-11-01.125Z-de6e401a-6965-4908-9cd7-daf6a6659d83/. Shopify file capture reached 996/996; interrupted upload retried automatically. Final combined result and independent fresh proof recovery are still pending. Recovery downloader requires a daily pair created after 19:10 UTC, refusing the earlier empty-proof baseline.

### Approved artwork recovered independently — passed

The fresh combined live backup completed at 15:25:43 EDT with exitCode 0; Render reported success at 15:25:48. Portal capture includes 2 PortalRecord proofs, 3 R2 objects, 996 Shopify files, and 999 assets. Existing October monthly copy was verified without replacing its earlier baseline. Fresh daily pair: recovery/postgresql/scheduled/live/16e80f-5b/pairs/2026-10-13T19-21-05.340Z-33d51d6c-d0f8-463d-9013-400bc44d6280.json. Two known baseline gaps remain.

Independently downloaded 5 database and 1,091 portal archive objects from Backblaze; all receipt hashes and authenticated decryption passed. Restored the fresh PostgreSQL dump into a separate local PostgreSQL 18 cluster with TCP disabled. All four tables matched every field against the dump; stopped the temporary cluster after verification. Both recovered SVG files exactly match original bytes and their proof content hashes. Recovered A remains submitted, and B retains its customer-approved status. No live database restore or modification was performed.

Private evidence: approved-artwork-restore/VERIFIED.json, DATABASE-ALL-FIELDS.json, ARTWORK-VERIFIED.json; customer approval screenshot live-proof-b-approved.png and completed job screenshot live-fresh-backup-success.png. This closes fresh artwork/approval backup recovery. Customer download bytes, replacement hosting, scheduled-run observation, and controlled actual purchase/refund/fulfillment remain separate gates before invitations.

### Real customer artwork download — passed

Prepared a fresh secure download through the genuine signed-in Portal Isolation Test B customer session and downloaded Open proof file through Chrome. The 654-byte isolation-artwork-B.svg exactly matches the original; SHA-256 7195e73c9e72b45282bd141d33fbbf39b63cf6be87df1de3e18db92915ad8410. Evidence: customer-download-verified.json outside Git. This closes successful customer download-byte verification for B, supplementing prior bidirectional unauthorized-download denials.

Controlled checkout preparation: owner chose to provide a delivery address here; recipient/full address is pending. Proposed first order is one Brass Ball Marker with individual shipping and the approved $2/unit organizer rule. B company currently submits checkouts as draft orders for review; account checkout may therefore require staff review/payment completion before it becomes a paid order. Do not claim payment from draft submission. Both organizations/campaigns remain draft, with no start/close dates, so the public campaign is not yet purchasable. Review a bounded campaign availability window and exact checkout total before purchase. No payment or invitations performed.

### Approved temporary publication and checkout preparation

Owner explicitly approved temporary publication of organization B and campaign B through October 14. Updated only B organization status to live and campaign lifecycle to live with close date 2026-10-14; A remains draft. Public /community/stores/portal-isolation-test-b renders the intended campaign and Brass Golf Ball Marker. Added one Logo Upload / Side 2 Logo Upload variant (48645252481279), $14.99, through the campaign page. Cart confirmed quantity 1.

Checkout authenticated as test company B, retains Submit for review / choose payment later. Shipping is locked to company B and shows (No address), with no address-entry control. The displayed $16.22 due-later estimate is not a verified shipped total and must not be approved as final. No order submitted or payment made. Owner provided a checkout destination privately; requested specific approval before persisting it as test company B delivery address. Address is intentionally omitted from this repository. Evidence: live-test-b-published.png and live-checkout-missing-company-address.png outside Git.

### Test-company address repaired; checkout estimate ready

Owner approved saving the supplied delivery address to test company B. Saved shipping address on existing location 8292434175; no billing address or checkout permissions changed. Refreshed the existing customer checkout: one marker $14.99, Economy shipping $4.90, estimated tax $1.62, total due later $21.51, due today $0.00. Checkout still requires Submit for review and says final tax/total confirmed after submission. No draft/order submission or payment yet. Evidence: live-checkout-shipping-total.png outside Git. Address omitted from repository.

### Live checkout submitted for review only

Owner explicitly authorized review submission only, not payment. Selected Choose payment method later and submitted once. Customer confirmation says Submitted / In review and Your order has been submitted for review. Staff queue shows exactly one open draft for company B: #D10, Shopify DraftOrder 1311383748863, $21.51 USD. Draft line carries signed campaign attribution plus campaign and organization names for B. Staff Collect payment remains available and was not used. This verifies the unpaid review path, not a paid sale, paid-order attribution, fulfillment, refund or payout. No payment authorization has been granted. Customer evidence: live-test-submitted-for-review.png outside Git.

### Unpaid draft preflight checked

Read-only staff inspection confirms #D10 quantity 1, variant 48645252481279/SKU BBM32RU, $14.99 subtotal, $4.90 Economy shipping, $1.62 estimated tax, $21.51 total, and review requirement. Signed attribution property plus correct B campaign/organization properties are present. No Collect payment, Send invoice, or conversion action used. Implementation review confirms the permanent approved-artwork/payout snapshot is created by order attribution using the order creation timestamp; draft metadata is not proof of that completed snapshot. Continue to respect review-only authorization. Paid-order attribution and the remaining real financial workflow require separate owner authorization.

### Real payment authorized; card entry pending

Owner authorized the real order at a maximum of $21.51. Opened draft #D10 Collect payment > Credit card; Shopify shows Charge $21.51 and empty secure card-entry fields. No stored payment method was offered, no card data entered, and no charge action taken. The next required input is owner entry in Shopify's secure form. Do not use Mark as paid as a substitute for an actual charge. Evidence: live-order-card-entry-required.png outside Git.

### Real paid order and automatic attribution verified

After owner reported completing the order, refreshed #D10: Completed, linked real order #1016 (7226278412543), created October 13 at 16:13:15 EDT. Order page confirms Paid $21.51 and a processed card-payment timeline entry; Unfulfilled. No second charge attempted. Portal Attributed orders already lists #1016 verified, campaign live-brass-b-20261013, 1 attributed unit, production proof Version 1. No manual missed-order scan was needed for this verification. Evidence: live-order-1016-attribution-verified.png outside Git. Synthetic artwork remains NOT FOR PRODUCTION; actual manufacturing/shipping, refund, payout, archive, and post-order independent backup recovery remain unverified.

### Administrative production rehearsal and full refund submitted

Owner approved administrative rehearsal and full $21.51 refund, with no manufacturing or shipping. Post-order combined backup started 16:15:36 EDT; capture includes a payout statement, but precedes subsequent batch/refund changes. Completion and independent recovery remain pending; a later final-state backup is still needed.

Saved initial draft payout statement showing $2.00 proceeds, unpaid. Closed campaign B at 2026-10-13T20:16:47Z after selecting today's close date (future October 14 date correctly rejected). Created batch LIVE-BRASS-B-20261013-BATCH-20261013201703: one #1016 unit, SKU BBM32RU, proof Version 1, hash 7195e73c9e72b45282bd141d33fbbf39b63cf6be87df1de3e18db92915ad8410. Unbatched units became zero, preventing another batch of the reserved unit. Added conspicuous administrative-only notes. Later cancelled the batch; locked cancellation and nothing unbatched verified. No production or Shopify fulfillment performed.

Submitted itemized full refund: quantity 1, $14.99 merchandise, $4.90 shipping, $1.62 tax = $21.51 to original payment; restock item selected. Shopify reports refund pending/processing and sent its refund notification. Do not claim card settlement. Payout view shows zero eligible units and zero calculated proceeds, but correctly blocks statement reconciliation while refund transaction is pending. Existing draft statement still reflects earlier $2; it is not payable/approved and must be refreshed after refund resolves. No archive or payout transfer performed. Evidence outside Git: live-production-snapshot-verified.png, live-refund-processing.png, live-payout-pending-refund-blocked.png.

### Post-order independent recovery passed; refund still pending

Post-order combined backup finished successfully at 16:31:40 EDT, exitCode 0. Capture: 18 metaobjects, 2 PortalRecords, 4 orders, 9 drafts, 999 assets; two known baseline gaps unchanged. Independently downloaded and authenticated-decrypted 5 database archive objects and 1,093 portal objects, validating all receipt hashes. Pair: recovery/postgresql/scheduled/live/16e80f-5b/pairs/2026-10-13T20-25-30.646Z-18fa5fd5-d2ce-4e0b-a131-70c9910c4bf3.json.

Recovered #1016 has verified attribution, exactly one unit of variant 48645252481279, campaign live-brass-b-20261013, fixed_per_unit $2 rule snapshot and approved proof Version 1. Recovered artwork bytes exactly match original B SVG and snapshot content hash. Evidence: paid-order-restore/VERIFIED.json and ORDER-1016-VERIFIED.json outside Git. This archive captured the pre-refund state, not the later cancellation/final refund. Database archive decrypted but this turn did not repeat an actual PostgreSQL import; earlier fresh-artwork import passed all-field comparisons.

Latest Shopify recheck still reports $21.51 refund pending. No duplicate refund, payout approval, archive, or fabricated paid statement performed. Final statement reconciliation, final-state backup/recovery, and archive wait for gateway resolution.

### October 14 scheduled backup and independent workflow recovery passed

Browser access restored. Render confirms scheduled 04:00 EDT trigger, success at 04:18:24, exitCode 0; 999 assets, 4 orders, 3 PortalRecords and 18 metaobjects. Independently downloaded 5 database and 1,099 portal archive objects; all receipt hashes and authenticated decryption passed. Recovered #1016 verified attribution, its pending $21.51 refund transaction and quantity-one refund line, cancelled production batch, and byte-identical approved B artwork. Evidence: scheduled-oct14-restore/VERIFIED.json and WORKFLOW-VERIFIED.json; scheduled-oct14-success.png. This establishes scheduled-run recovery of the pending-refund state, not settled-refund recovery or replacement hosting. Database archive decrypted; no new PostgreSQL import performed this turn. Final reconciliation/archive remain gated on refund completion.

### October 14 scheduled PostgreSQL import — passed

Imported the October 14 scheduled database dump into a new isolated local PostgreSQL 18 cluster with TCP disabled, using pg_restore --exit-on-error. Compared every field in BulkCheckoutAttempt, PortalRecord, Session, and _prisma_migrations against COPY data from the original dump: all four matched. Stopped the temporary cluster after verification. Evidence: scheduled-oct14-restore/DATABASE-ALL-FIELDS.json outside Git. No live infrastructure or source data changed, no new paid service created.

Replacement-hosting preflight found scripts/start-recovery-web.mjs deliberately pins the October 12 development recovery app, database, reader role, schema and R2 bucket. Those guards must not simply be removed to run the live drill. A live drill requires separately confirmed temporary identities, a pinned release, isolated restored data and restricted artwork access; then separately reviewed live routing/rollback and a controlled window. Existing one-time development drill spending approval is not reused. Refund remains pending on latest Shopify check; final statement/archive remain blocked.

### Proposed live replacement-hosting drill — October 14 (not provisioned)

Purpose: prove the verified live backup can operate on replacement hosting before participant invitations. Source baseline: October 14 08:12 UTC pair, independently decrypted and imported locally with all four database tables matching. Baseline has a pending refund; this drill must preserve that state rather than fabricate settlement.

Proposed new temporary resources (names subject to availability): analog-portal-live-recovery-db-20261014, analog-portal-live-recovery-app-20261014, and private R2 bucket analog-portal-live-recovery-20261014. Use smallest paid Render database and web compute in the same region, minimum database storage; no new recurring cron or workspace upgrade. Pricing reference: https://render.com/pricing and https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses (checked October 14). At $7/month web + $6/month database + 5 GB at $0.30/GB/month, base 24-hour cost is approximately $0.48 using a 30-day month. Proposed incremental Render spending ceiling: $1 total for less than 24 hours, including build/transfer headroom. This is an operating limit, not an automatic provider-enforced cap; confirm creation summaries and existing included usage before provisioning. Existing B2 account caps remain unchanged. Any incremental object-store charge outside existing limits requires review.

Preparation/verification sequence:
1. Build a dedicated recovery-target guard from pinned production commit 092d3afbe65246f04054188883d5f5c9b69ea399; retain explicit host/database/schema/role/bucket checks and fail closed. Validate the read-only HTTP boundary and prevent reconciliation/business writers. Never weaken existing development or live production guards.
2. Create isolated empty PostgreSQL, import the downloaded dump with fail-on-error, compare schema and all business/checkout fields. Limit app access to restored business records; copied session credentials stay inaccessible until a separately approved authentication phase.
3. Restore the original private artwork objects to the separate bucket, compare hashes, and verify authorized download plus unsigned/tampered/expired denial with a time-limited read-only credential. New credential access requires action-time confirmation.
4. Deploy a temporary read-only web service; verify startup, persistence after restart, test-order and cancelled-batch consistency. This stage does not change live routing and does not yet establish original-app authentication/cutover.
5. Prepare exact original-app/extension routing changes and reversal to analog-portal-live.onrender.com. Request a separate controlled maintenance window before pausing the live portal/backup and switching routing. Prevent concurrent token refresh and reconciliation. Never import the older pending-refund snapshot over current live data.
6. Verify genuine staff and both test-customer access, private artwork delivery, isolation and rollback. Record cutoff and measured duration; acknowledge unrelated live Shopify changes during the drill. Restore original routing/services and verify monitoring before ending window.
7. Stop temporary compute promptly; request specific permanent deletion approval for only temporary resources. Database storage may remain billable until deletion. Keep source backups and evidence.

No temporary services, credentials, public routes, or new charges created by this preparation. Previous one-time recovery budgets are not reused.

### Temporary live recovery database provisioned — in progress

Owner approved a new $1 total Render budget for this drill, less than 24 hours. At 2026-10-14T16:31:39.459306+00:00 created analog-portal-live-recovery-db-20261014, ID dpg-db7qsbjbc2fs738613s0-a, Ohio, PostgreSQL 18, 256 MB/0.1 CPU, 1 GB storage. Creation summary $6.30/month prorated (~$0.21/day). Autoscaling/HA disabled. Explicitly confirmed blocking all public internet ingress; private network only. Still creating storage volume on latest check. No backup imported, new reader credential or web service created yet. Evidence: live-recovery-db-private.png. Cleanup deadline is less than 24 hours from creation; $1 is a manual operating budget, not provider-enforced. Next: readiness, restore via private network, scoped reader and guarded temporary app.

### October 14 private-network hosted restore — passed

Database available; public ingress remains blocked. Owner approved passing this temporary database credential and the October 14 backup through the existing Render backup-service shell. Restored only dpg-db7qsbjbc2fs738613s0-a / analog_portal_live_recovery_20261014, requiring an empty target and a transaction. All four tables matched every field at 2026-10-14T16:36:23.728Z. Evidence: hosted-recovery-oct14/HOSTED-ALL-FIELDS.json and hosted-restore-passed.png outside Git. Initial module-launch syntax error made no database connection; corrected launcher succeeded. Shell history/echo were disabled before transmitting credentials.

Connection used the private hostname with mandatory TLS (sslmode=require), not certificate-verified external TLS. Render documents internal self-signed certificates and lack of verify-ca/verify-full support: https://render.com/docs/postgresql-creating-connecting . A strict certificate probe failed as expected; public ingress was not opened.

Prepared dedicated Dockerfile.live-recovery and exact-target startup guard; original development recovery guard is unchanged. Thirteen target and HTTP boundary tests passed (loopback test required sandbox escalation). New guard pins private host, temporary database, reader role, schema, app URL and artwork bucket. Existing scheduler checks exclude this replacement URL. Prepared locally an expiring read-only role (October 15 12:00 UTC), views of business records/checkout attempts, and empty recovery Session table; copied public.Session stays inaccessible. No role created or app credential saved to Render yet. Synthetic Shopify credentials are proposed for initial deployment. No live routing change, new R2 key, payout action or invitation performed. New limited app-access confirmation is pending; original $1 budget and cleanup deadline still apply.
