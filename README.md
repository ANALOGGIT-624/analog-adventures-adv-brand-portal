# Analog Adventures Brand Portal

Shopify application for managing Analog Adventures brand kits, organization
micro-stores, campaigns, artwork approvals, product selections, and payouts
inside one Shopify store.

The canonical development configuration is linked to **Analog Adventures Test**
with client ID `8158f984f0ec6fed1e5f85b44a588777`.

## Portal surfaces

- Embedded Shopify Admin dashboard for Analog Adventures staff
- Organization-store creation linked to Shopify Companies
- Campaign setup with products, dates, payout rules, and fulfillment mode
- Payout reconciliation from verified orders, refunds, cancellations, and deductions
- Idempotent campaign statements with settlement and paid-status safeguards
- Full-page New Customer Accounts extension for approved organization contacts
- Authenticated `/public/portal` endpoint for customer-specific portal data
- Organization requests with immutable customer-submitted source artwork and
  controlled staff review before the existing production-proof workflow

See [the implementation roadmap](docs/brand-portal-roadmap.md) for the Gantt
chart, launch gates, pilot sequence, and remaining Neighborhood-style features.

## Current status — October 1, 2026

This is a hosted development-store application for **Analog Adventures Test**
(`analog-adventures-test.myshopify.com`). The separate live Shopify site has not
been migrated or changed by this project. External pilots are not yet cleared.

### Business features implemented

- Staff dashboard, company-linked organization stores, campaign products/dates,
  payout rules, production timing, and guarded close/archive/relaunch actions.
- Branded public micro-stores at `/community/stores/<slug>`, with signed order
  attribution and a customer-account portal restricted to current company contacts.
- Versioned artwork uploads, organizer approval/revision requests, immutable
  approved proofs, and order snapshots of the exact approved proof ID/version/hash.
- Organization requests for stores, campaigns, products and branding, reviewed
  by staff before they change an existing campaign.
- Individual-shipping checkout and separate bulk-to-organizer draft-order
  checkout with $0 buyer shipping, private organizer destinations, server-side
  product/quantity checks, and duplicate-submission protection.
- Production queues/batches, quantity reservation, guarded status transitions,
  locked completed batches, proof references, and sales/production/payout CSVs.
- Refund/fulfillment-aware payout reconciliation, deductions, settlement delay,
  idempotent statements, payment confirmation and immutable paid statements.
  Amount-only refunds now include Shopify's signed discrepancy adjustments,
  allocated across all merchandise lines without changing returned quantities.
  Pending/failed transactions, truncated data and unsupported adjustments block
  statement creation. The UI explains allocation and unit-rule behavior.

### Hosting and storage

The app runs at https://analog-portal-pilot.onrender.com on the existing Render
web service. It uses managed PostgreSQL with the separate
`prisma-postgresql/schema.prisma` profile, a reviewed predeploy migration and a
DB-aware `/health` endpoint. Auto-deploy is off. The released Shopify app and
customer extension use the hosted URL; the installed proxy was aligned with
`/community/stores` after Shopify assigned a suffixed path.

| Data | Active storage |
| --- | --- |
| Sessions and duplicate-checkout snapshots | PostgreSQL |
| Artwork proofs, production batches, organization requests, delivery addresses | PostgreSQL `PortalRecord`, scoped by shop and type |
| Organizations, campaigns, rules, payout statements, products and orders | Shopify |
| Private artwork bytes | Cloudflare R2 |
| Independent encrypted backups | Backblaze B2 |

`PORTAL_DATA_BACKEND=postgresql` is enabled on the hosted app and backup worker.
Local development retains its SQLite profile. Keep both Prisma model sets
aligned; never run SQLite setup/reset commands against hosted PostgreSQL. Once
new database records exist, disabling the backend flag is not a safe rollback.

Private R2 uploads use immutable asset identities and content hashes. Downloads
require staff authentication or current company membership, validate the
organization/campaign relationship, and issue short-lived links. Embedded staff
links are prepared through authenticated App Bridge requests. Backups use a
separate read-only R2 credential.

Approved Render base costs are $7/month for the app, $7.50/month for PostgreSQL
including its allocated storage, and the approved $2/month backup worker: $16.50
before provider usage, taxes and independent storage charges. This is the
approved configuration, not a guarantee against future usage charges. No new
paid service was added for the operational-record migration.

### Backup and recovery work completed

- Transactional SQLite-to-PostgreSQL migration, preserving sessions and checkout
  snapshots, plus isolated logical restore and a temporary Render recovery test.
- Daily combined backup worker at **08:00 UTC** (4am New York during daylight
  saving time), with separate PostgreSQL and Shopify/R2 archives and monitors.
- Encrypted Backblaze upload, read-back hashes, authenticated decryption and
  dump checks. Only the recovery public key is stored on Render; the owner
  confirmed the recovery key is available through Apple Passwords on another device.
- Healthchecks success/failure/missed-run monitoring, with email alerts. Saved
  baseline changes must be verified after saving and included in a rebuilt worker.
- Real `FSS.svg` upload/approval recovery: independently downloaded bytes matched
  the original 548,648-byte file and its SHA-256. A labeled operational recovery
  copy was also verified through staff and customer access.
- Following the Shopify app-definition/preview incident, four approved proofs
  and one completed production batch were recovered into PostgreSQL from the
  verified offsite archive. Original IDs, field values, approvals and timestamps
  were preserved. A synthetic delivery address was then saved through the app.
- October 1 independent PostgreSQL restore matched every field in six portal
  records, four checkout attempts, one session and two migration records, plus
  the complete schema. The rebuilt worker's portal archive independently restored
  133 files from 136 encrypted objects with the intended monitoring baseline.

The current verified backup baseline is 36 Shopify records, seven PostgreSQL
portal records, 11 orders, four companies, 16 drafts, four R2 objects, 32 Shopify
file records and 35 downloaded assets. The 19:15 UTC combined worker run passed.
An independent Backblaze download verified all 162 encrypted objects and decrypted
159 files; recovered orders recalculated to the same $5/$4 simulated payouts,
with archived campaigns, completed batches, approved proofs and the saved baseline
intact. New testing will increase these counts.
Historical gaps remain explicit: nine proofs, five batches, five requests, two
older delivery records, four inaccessible historical references, limited older
order access and one external video. Count discrepancies where Shopify reports
fewer entries than were exported are also recorded. Green backups do not mean
those historical gaps were recovered. Captures across services are not atomic.

### Remaining pilot gates and current rehearsal

The October 1 hosted rehearsal completed both delivery paths through archive,
using the development store's Bogus Gateway. No real payment, manufacture,
shipment or organizer transfer was made. “Paid” below is a simulated portal status.

| Checkpoint | Individual shipping | Bulk delivery |
| --- | --- | --- |
| Campaign | E2E-20261001-IND | E2E-20261001-BULK |
| Test order | #1010, one unit | #1011, two units from draft #D16 |
| Gross merchandise | $949.95 | $1,899.90 |
| Refund | $10.00 goodwill, no units returned | $949.95, one unit refunded |
| Eligible fulfilled units | 1 | 1 |
| Calculated proceeds | $5.00 | $5.00 |
| Test deduction | $0.00 | $1.00 |
| Final simulated statement | $5.00, paid | $4.00, paid |
| Campaign status | Archived | Archived |

Both orders retain the approved artwork ID/version/hash and campaign attribution.
Bulk checkout locked the organizer address and charged $0 shipping. Double-click
checkout/payment testing produced one bulk draft/order with the intended quantity.
Both production batches passed queued → in production → ready to ship → completed
and locked; the bulk batch reserved all units against duplicate batching. Shopify
fulfillment was recorded without shipment notifications. The item refund had
restocking and refund notification disabled. Shopify automatically sent its
standard order confirmation to the test account owner.

Statements passed draft → approved → paid. Missing paid confirmation was rejected,
and trying to overwrite the paid bulk statement was rejected. The amount-only
refund fix was verified against Shopify's actual successful $10 transaction and
in the hosted payout screen before either statement was finalized. Validation:
177 passing tests, production build, targeted lint, and Shopify API 2026-07 schema
validation. Tests cover cent allocation across campaigns, percentage proceeds,
positive discrepancies, shipping exclusion and unresolved refund safeguards.
Backups now preserve paginated refund adjustments and transaction status/amounts
in addition to refund line items, so restored reports retain this evidence.

Before an external pilot: resolve
or explicitly accept the historical synthetic-data gaps; establish retention and
credential-rotation ownership; finish reliability/security review and the hosted
replacement/cutover portion of the operational recovery drill. The isolated
October 1 rebuild, read-only database, restart and recovered-data checks passed.
A separately approved temporary recovery app also passed real Shopify staff and
customer authentication, each downloading the restored original artwork over
HTTPS with a matching SHA-256. Its tunnel and local services were then stopped;
the temporary app registration and unlinked customer page remain. This separate
app test does not prove production cutover or replacement R2 hosting.
A final hosted check also found a transient customer-portal HTTP 500 during
offline-session renewal; it recovered after staff session creation and reload.
Fix and test unattended customer access across token expiry before pilot.
Immutable backup retention is not enabled and
proposed recovery-time/data-loss targets are not yet proven. The existing app's
R2 key expires October 24, 2026; backup R2 and Backblaze keys expire December 28.

### Operating references

- [October 1 isolated app-recovery drill and remaining limits](docs/app-recovery-drill-20261001.md)
- [Hosting and PostgreSQL deployment](docs/durable-hosting.md)
- [Private artwork storage and authorization](docs/private-artwork-storage.md)
- [Backup and recovery procedures](docs/backup-and-recovery.md)
- [Scheduled PostgreSQL backups](docs/scheduled-postgresql-backups.md)
- [Scheduled Shopify/R2 backups and recovery evidence](docs/scheduled-portal-backups.md)
- [Bulk organizer checkout](docs/bulk-organizer-checkout.md)
- [Product roadmap](docs/brand-portal-roadmap.md) — its September checkpoints are
  historical; this README and the dated recovery logs describe the current state.

Do not uninstall the app, remove definitions, run preview cleanup, reset a
hosted database, prune backups, or replay orders/refunds as a troubleshooting
shortcut. Preserve a verified recovery point and review the exact scope first.
Secrets and private recovery evidence stay outside Git. The older template
reference below is background, not the hosted deployment procedure.

## Local verification

```shell
npm install
npm test
npm run lint
npm run typecheck
npm run build
shopify app config validate --json
```

For the hosted app, commit reviewed changes and manually deploy the selected
commit on Render; verify `/health` and the embedded app. Do not start a local
`shopify app dev` preview against this installed app during a hosted pilot:
preview/configuration changes require a separate reviewed test plan and backup.

## Shopify template reference

This is a template for building a [Shopify app](https://shopify.dev/docs/apps/getting-started) using [React Router](https://reactrouter.com/). It was forked from the [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix) and converted to React Router.

Rather than cloning this repo, follow the [Quick Start steps](https://github.com/Shopify/shopify-app-template-react-router#quick-start).

Visit the [`shopify.dev` documentation](https://shopify.dev/docs/api/shopify-app-react-router) for more details on the React Router app package.

## Upgrading from Remix

If you have an existing Remix app that you want to upgrade to React Router, please follow the [upgrade guide](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix). Otherwise, please follow the quick start guide below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [the Shopify CLI](https://shopify.dev/docs/apps/tools/cli). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

### Authenticating and querying data

To authenticate and query data you can use the `shopify` const that is exported from `/app/shopify.server.js`:

```js
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);

  const response = await admin.graphql(`
    {
      products(first: 25) {
        nodes {
          title
          description
        }
      }
    }`);

  const {
    data: {
      products: { nodes },
    },
  } = await response.json();

  return nodes;
}
```

This template comes pre-configured with examples of:

1. Setting up your Shopify app in [/app/shopify.server.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/shopify.server.ts)
2. Querying data using Graphql. Please see: [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx).
3. Responding to webhooks. Please see [/app/routes/webhooks.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/webhooks.app.uninstalled.tsx).
4. Using metafields, metaobjects, and declarative custom data definitions. Please see [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx) and [shopify.app.toml](https://github.com/Shopify/shopify-app-template-react-router/blob/main/shopify.app.toml).

Please read the [documentation for @shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) to see what other API's are available.

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot) and [Claude Code](https://claude.com/product/claude-code) and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Deployment

### Application Storage

This template uses [Prisma](https://www.prisma.io/) to store session data, by default using an [SQLite](https://www.sqlite.org/index.html) database.
The database is defined as a Prisma schema in `prisma/schema.prisma`.

This use of SQLite works in production if your app runs as a single instance.
The database that works best for you depends on the data your app needs and how it is queried.
Here’s a short list of databases providers that provide a free tier to get started:

| Database   | Type             | Hosters                                                                                                                                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MySQL      | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mysql), [Planet Scale](https://planetscale.com/), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/mysql) |
| PostgreSQL | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-postgresql), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/postgres)                                   |
| Redis      | Key-value        | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-redis), [Amazon MemoryDB](https://aws.amazon.com/memorydb/)                                                                                                        |
| MongoDB    | NoSQL / Document | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mongodb), [MongoDB Atlas](https://www.mongodb.com/atlas/database)                                                                                                  |

To use one of these, you can use a different [datasource provider](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource) in your `schema.prisma` file, or a different [SessionStorage adapter package](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/guides/session-storage.md).

### Build

Build the app by running the command below with the package manager of your choice:

Using yarn:

```shell
yarn build
```

Using npm:

```shell
npm run build
```

Using pnpm:

```shell
pnpm run build
```

## Hosting

When you're ready to set up your app in production, you can follow [our deployment documentation](https://shopify.dev/docs/apps/launch/deployment) to host it externally. From there, you have a few options:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run): This tutorial is written specifically for this example repo, and is compatible with the extended steps included in the subsequent [**Build your app**](tutorial) in the **Getting started** docs. It is the most detailed tutorial for taking a React Router-based Shopify app and deploying it to production. It includes configuring permissions and secrets, setting up a production database, and even hosting your apps behind a load balancer across multiple regions.
- [Fly.io](https://fly.io/docs/js/shopify/): Leverages the Fly.io CLI to quickly launch Shopify apps to a single machine.
- [Render](https://render.com/docs/deploy-shopify-app): This tutorial guides you through using Docker to deploy and install apps on a Dev store.
- [Manual deployment guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service): This resource provides general guidance on the requirements of deployment including environment variables, secrets, and persistent data.

When you reach the step for [setting up environment variables](https://shopify.dev/docs/apps/deployment/web#set-env-vars), you also need to set the variable `NODE_ENV=production`.

## Gotchas / Troubleshooting

### Database tables don't exist

If you get an error like:

```
The table `main.Session` does not exist in the current database.
```

Create the database for Prisma. Run the `setup` script in `package.json` using `npm`, `yarn` or `pnpm`.

### Navigating/redirecting breaks an embedded app

Embedded apps must maintain the user session, which can be tricky inside an iFrame. To avoid issues:

1. Use `Link` from `react-router` or `@shopify/polaris`. Do not use `<a>`.
2. Use `redirect` returned from `authenticate.admin`. Do not use `redirect` from `react-router`
3. Use `useSubmit` from `react-router`.

This only applies if your app is embedded, which it will be by default.

### Webhooks: shop-specific webhook subscriptions aren't updated

If you are registering webhooks in the `afterAuth` hook, using `shopify.registerWebhooks`, you may find that your subscriptions aren't being updated.

Instead of using the `afterAuth` hook declare app-specific webhooks in the `shopify.app.toml` file. This approach is easier since Shopify will automatically sync changes every time you run `deploy` (e.g: `npm run deploy`). Please read these guides to understand more:

1. [app-specific vs shop-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions)
2. [Create a subscription tutorial](https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started?deliveryMethod=https)

If you do need shop-specific webhooks, keep in mind that the package calls `afterAuth` in 2 scenarios:

- After installing the app
- When an access token expires

During normal development, the app won't need to re-authenticate most of the time, so shop-specific subscriptions aren't updated. To force your app to update the subscriptions, uninstall and reinstall the app. Revisiting the app will call the `afterAuth` hook.

### Webhooks: Admin created webhook failing HMAC validation

Webhooks subscriptions created in the [Shopify admin](https://help.shopify.com/en/manual/orders/notifications/webhooks) will fail HMAC validation. This is because the webhook payload is not signed with your app's secret key.

The recommended solution is to use [app-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions) defined in your toml file instead. Test your webhooks by triggering events manually in the Shopify admin(e.g. Updating the product title to trigger a `PRODUCTS_UPDATE`).

### Webhooks: Admin object undefined on webhook events triggered by the CLI

When you trigger a webhook event using the Shopify CLI, the `admin` object will be `undefined`. This is because the CLI triggers an event with a valid, but non-existent, shop. The `admin` object is only available when the webhook is triggered by a shop that has installed the app. This is expected.

Webhooks triggered by the CLI are intended for initial experimentation testing of your webhook configuration. For more information on how to test your webhooks, see the [Shopify CLI documentation](https://shopify.dev/docs/apps/tools/cli/commands#webhook-trigger).

### Incorrect GraphQL Hints

By default the [graphql.vscode-graphql](https://marketplace.visualstudio.com/items?itemName=GraphQL.vscode-graphql) extension for will assume that GraphQL queries or mutations are for the [Shopify Admin API](https://shopify.dev/docs/api/admin). This is a sensible default, but it may not be true if:

1. You use another Shopify API such as the storefront API.
2. You use a third party GraphQL API.

If so, please update [.graphqlrc.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/.graphqlrc.ts).

### Using Defer & await for streaming responses

By default the CLI uses a cloudflare tunnel. Unfortunately cloudflare tunnels wait for the Response stream to finish, then sends one chunk. This will not affect production.

To test [streaming using await](https://reactrouter.com/api/components/Await#await) during local development we recommend [localhost based development](https://shopify.dev/docs/apps/build/cli-for-apps/networking-options#localhost-based-development).

### "nbf" claim timestamp check failed

This is because a JWT token is expired. If you are consistently getting this error, it could be that the clock on your machine is not in sync with the server. To fix this ensure you have enabled "Set time and date automatically" in the "Date and Time" settings on your computer.

### Using MongoDB and Prisma

If you choose to use MongoDB with Prisma, there are some gotchas in Prisma's MongoDB support to be aware of. Please see the [Prisma SessionStorage README](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-prisma#mongodb).

### Unable to require(`C:\...\query_engine-windows.dll.node`).

Unable to require(`C:\...\query_engine-windows.dll.node`).
The Prisma engines do not seem to be compatible with your system.

query_engine-windows.dll.node is not a valid Win32 application.

**Fix:** Set the environment variable:

```shell
PRISMA_CLIENT_ENGINE_TYPE=binary
```

This forces Prisma to use the binary engine mode, which runs the query engine as a separate process and can work via emulation on Windows ARM64.

## Resources

React Router:

- [React Router docs](https://reactrouter.com/home)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library).
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components).
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)

Internationalization:

- [Internationalizing your app](https://shopify.dev/docs/apps/best-practices/internationalization/getting-started)

Session-renewal repair and deployment evidence: [October 1 renewal check](docs/session-renewal-20261001.md).
