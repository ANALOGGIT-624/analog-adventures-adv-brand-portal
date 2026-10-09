import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  PORTAL_TYPES,
  normalizeMetaobject,
} from "../app/lib/brand-portal.server.js";
import { referenceIds } from "../app/lib/public-storefront.server.js";
import {
  signedLineAttributions,
  attributionTokenForVariant,
} from "../app/lib/attribution.server.js";
import { approvedProofForCampaign } from "../app/lib/proof-workflow.server.js";
const source = (
  await readFile(
    new URL("../app/routes/webhooks.orders.create.jsx", import.meta.url),
    "utf8",
  )
)
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export const /g, "const ");
const node = (id, handle, values) => ({
  id,
  handle,
  fields: Object.entries(values).map(([key, value]) => ({ key, value })),
});
function harness({
  status = "live",
  missingAdmin = false,
  failWrite = false,
} = {}) {
  const writes = [];
  let persisted = null;
  const proofValues = {
    organization_store_id: "org-a",
    campaign_id: "campaign-a",
    status: "approved",
    version_number: "1",
    reviewed_at: "2026-10-01T09:00:00Z",
    private_asset_id: "asset-1",
    content_hash: "hash-1",
  };
  const data = {
    campaigns: {
      nodes: [
        node("campaign-a", "campaign-a", {
          status,
          starts_at: "2026-10-01T00:00:00Z",
          closes_at: "2026-10-01T12:00:00Z",
          products: '["gid://shopify/Product/1"]',
          organization_store: "org-a",
          payout_rule: "rule-a",
        }),
      ],
    },
    payoutRules: {
      nodes: [
        node("rule-a", "rule-a", {
          method: "fixed_per_unit",
          rate: "5",
          basis: "fulfilled",
        }),
      ],
    },
    proofs: { nodes: [node("proof-1", "proof-1", proofValues)] },
  };
  const payload = {
    id: 1,
    created_at: "2026-10-01T10:00:00Z",
    line_items: [
      {
        id: 11,
        product_id: 1,
        variant_id: 2,
        quantity: 1,
        price: "20.00",
        properties: [
          {
            name: "_aa_attribution",
            value: attributionTokenForVariant({
              campaignHandle: "campaign-a",
              productId: "1",
              variantId: "2",
              expiresAt: "2026-10-01T12:00:00Z",
              secret: "test-secret",
            }),
          },
        ],
      },
    ],
  };
  const admin = {
    graphql: async (query, { variables } = {}) => {
      if (query.includes("ExistingOrderAttribution"))
        return Response.json({
          data: {
            order: persisted
              ? {
                  manifest: { jsonValue: persisted },
                  status: { value: "verified" },
                }
              : { manifest: null, status: null },
          },
        });
      if (query.includes("RecordOrderAttribution")) {
        if (failWrite) {
          failWrite = false;
          throw Error("Temporary transport failure");
        }
        if (
          persisted &&
          variables.metafields.some(
            (f) => f.key === "attribution_manifest" && f.compareDigest === null,
          )
        )
          return Response.json({
            data: {
              metafieldsSet: {
                userErrors: [
                  { message: "Compare failed", code: "INVALID_COMPARE_DIGEST" },
                ],
              },
            },
          });
        writes.push(variables.metafields);
        persisted = JSON.parse(
          variables.metafields.find((f) => f.key === "attribution_manifest")
            .value,
        );
        return Response.json({
          data: { metafieldsSet: { metafields: [], userErrors: [] } },
        });
      }
      return Response.json({ data });
    },
  };
  const action = vm.runInNewContext(source + "\naction", {
    Response,
    console: { log() {} },
    process: { env: { SHOPIFY_API_SECRET: "test-secret" } },
    authenticate: {
      webhook: async () => ({
        admin: missingAdmin ? undefined : admin,
        payload,
        shop: "test.myshopify.com",
        topic: "ORDERS_CREATE",
      }),
    },
    prisma: { bulkCheckoutAttempt: {} },
    bulkOrderManifest: async () => null,
    databasePortalEnabled: () => false,
    PORTAL_TYPES,
    normalizeMetaobject,
    referenceIds,
    signedLineAttributions,
    approvedProofForCampaign,
  });
  return {
    writes,
    data,
    run: () =>
      action({
        request: new Request("https://app.example.com/webhooks/orders/create", {
          method: "POST",
        }),
      }),
  };
}
test("temporary attribution write failure remains retryable", async () => {
  const h = harness({ failWrite: true });
  await assert.rejects(h.run());
  assert.equal(h.writes.length, 0);
  assert.equal((await h.run()).status, 200);
  assert.equal(h.writes.length, 1);
});
test("a missing offline session must not acknowledge an unprocessed order", async () => {
  const h = harness({ missingAdmin: true });
  const response = await h.run();
  assert.ok(
    response.status >= 500,
    "missing session was silently acknowledged",
  );
});
test("delayed notification preserves an order placed before campaign close", async () => {
  const h = harness({ status: "closed" });
  await h.run();
  assert.equal(
    h.writes.length,
    1,
    "eligible delayed order was silently discarded",
  );
});
test("duplicate delivery must preserve the original proof snapshot", async () => {
  const h = harness();
  await h.run();
  h.data.proofs.nodes.push(
    node("proof-2", "proof-2", {
      campaign_id: "campaign-a",
      status: "approved",
      version_number: "2",
      reviewed_at: "2026-10-01T11:00:00Z",
      private_asset_id: "asset-2",
      content_hash: "hash-2",
    }),
  );
  await h.run();
  const manifests = h.writes.map((fields) =>
    JSON.parse(fields.find((f) => f.key === "attribution_manifest").value),
  );
  assert.equal(
    manifests.at(-1).lines[0].artworkProofSnapshot.id,
    "proof-1",
    "duplicate delivery changed the approved artwork",
  );
});

test("concurrent duplicates cannot overwrite a winning atomic write", async () => {
  const h = harness();
  const results = await Promise.allSettled([h.run(), h.run()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(h.writes.length, 1);
  assert.equal((await h.run()).status, 200);
  assert.equal(h.writes.length, 1);
});
test("first delivery after a newer approval still uses artwork approved when ordered", async () => {
  const h = harness({ status: "archived" });
  h.data.proofs.nodes.push(
    node("proof-2", "proof-2", {
      organization_store_id: "org-a",
      campaign_id: "campaign-a",
      status: "approved",
      version_number: "2",
      reviewed_at: "2026-10-01T11:00:00Z",
    }),
  );
  await h.run();
  assert.equal(
    JSON.parse(h.writes[0][0].value).lines[0].artworkProofSnapshot.id,
    "proof-1",
  );
});
test("missing reference data does not silently acknowledge a signed order", async () => {
  const h = harness();
  h.data.campaigns.nodes = [];
  await assert.rejects(h.run(), /unavailable/);
  assert.equal(h.writes.length, 0);
});
test("unknown historical proof approval cannot be attributed automatically", async () => {
  const h = harness();
  h.data.proofs.nodes[0].fields = h.data.proofs.nodes[0].fields.filter(
    (f) => f.key !== "reviewed_at",
  );
  await assert.rejects(h.run(), /No provable/);
  assert.equal(h.writes.length, 0);
});
