import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { File } from "node:buffer";
import {
  PORTAL_TYPES,
  normalizeMetaobject,
  slugify,
} from "../app/lib/brand-portal.server.js";
import { proofValues } from "../app/lib/proof-workflow.server.js";
import { createOrganizationRequestValues } from "../app/lib/organization-request.server.js";
import { publicPayoutStatement } from "../app/lib/portal-payout.js";

// Execute the actual route handlers, replacing only imports/exports so Node can
// load the JSX route without starting Shopify or requiring live credentials.
const source = (
  await readFile(
    new URL("../app/routes/public.portal.jsx", import.meta.url),
    "utf8",
  )
)
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export const /g, "const ");
const node = (id, values) => ({
  id,
  handle: id,
  fields: Object.entries(values).map(([key, value]) => ({ key, value })),
});
function fixture() {
  return {
    customer: {
      id: "customer-a",
      displayName: "Customer A",
      companyContactProfiles: [{ company: { id: "company-a" } }],
    },
    organizations: {
      nodes: [
        node("org-a", { company: "company-a" }),
        node("org-a2", { company: "company-a" }),
        node("org-b", { company: "company-b" }),
      ],
    },
    campaigns: {
      nodes: [
        node("campaign-a", { organization_store: "org-a" }),
        node("campaign-a2", { organization_store: "org-a2" }),
        node("campaign-b", { organization_store: "org-b" }),
      ],
    },
    proofs: {
      nodes: [
        node("proof-a", {
          organization_store_id: "org-a",
          campaign_id: "campaign-a",
          status: "submitted",
        }),
        node("proof-b", {
          organization_store_id: "org-b",
          campaign_id: "campaign-b",
          status: "submitted",
        }),
        node("proof-mismatch", {
          organization_store_id: "org-a",
          campaign_id: "campaign-b",
          status: "submitted",
        }),
        node("proof-sibling", {
          organization_store_id: "org-a",
          campaign_id: "campaign-a2",
          status: "submitted",
        }),
      ],
    },
    requests: {
      nodes: [
        node("request-a", {
          company_id: "company-a",
          organization_store_id: "org-a",
          campaign_id: "campaign-a",
        }),
        node("new-store-a", { company_id: "company-a" }),
        node("request-b", {
          company_id: "company-b",
          organization_store_id: "org-b",
        }),
        node("bad-org", {
          company_id: "company-a",
          organization_store_id: "org-b",
        }),
        node("bad-company", {
          company_id: "company-b",
          organization_store_id: "org-a",
        }),
        node("bad-campaign", {
          company_id: "company-a",
          organization_store_id: "org-a",
          campaign_id: "campaign-a2",
        }),
      ],
    },
    payoutStatements: {
      nodes: [
        node("statement-a", { campaign: "campaign-a" }),
        node("statement-b", { campaign: "campaign-b" }),
      ],
    },
    payoutRules: { nodes: [] },
  };
}
function harness({
  data = fixture(),
  sub = "customer-a",
  authError,
  errors,
} = {}) {
  const writes = [],
    uploads = [],
    queries = [],
    shops = [];
  const handlers = vm.runInNewContext(`${source}\n({ loader, action });`, {
    Response,
    File,
    PORTAL_TYPES,
    normalizeMetaobject,
    slugify,
    proofValues,
    createOrganizationRequestValues,
    publicPayoutStatement,
    authenticate: {
      public: {
        customerAccount: async () => {
          if (authError) throw authError;
          return {
            sessionToken: { sub, dest: "test-shop" },
            cors: (response) => response,
          };
        },
      },
    },
    unauthenticated: {
      admin: async (shop) => {
        shops.push(shop);
        return {
          admin: {
            graphql: async (query, options) => {
              queries.push({ query, ...options });
              return { json: async () => ({ data, errors }) };
            },
          },
        };
      },
    },
    upsertMetaobject: async (_admin, value) => {
      writes.push(value);
      return { id: "saved" };
    },
    artworkShop: () => "test.myshopify.com",
    createPrivateArtworkStorage: () => ({
      upload: async ({ file }) => {
        uploads.push(file);
        return { assetId: "private-asset", contentHash: "hash" };
      },
    }),
  });
  const post = (input) =>
    handlers.action({
      request: new Request("https://example.test/public/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    });
  return { ...handlers, post, writes, uploads, queries, shops };
}
const validRequest = {
  intent: "create-request",
  requestType: "new_campaign",
  organizationId: "org-a",
  campaignId: "campaign-a",
  title: "Test",
  details: "Test request",
};

test("loader scopes records and rejects inconsistent ownership chains", async () => {
  const h = harness();
  const result = await (
    await h.loader({
      request: new Request(
        "https://example.test/public/portal?organizationId=org-b",
      ),
    })
  ).json();
  assert.deepEqual(
    result.organizations.map((x) => x.id),
    ["org-a", "org-a2"],
  );
  assert.deepEqual(
    result.campaigns.map((x) => x.id),
    ["campaign-a", "campaign-a2"],
  );
  assert.deepEqual(
    result.proofs.map((x) => x.id),
    ["proof-a"],
  );
  assert.deepEqual(
    result.requests.map((x) => x.id),
    ["request-a", "new-store-a"],
  );
  assert.equal(result.statements.length, 1);
  assert.equal(h.queries[0].variables.customerId, "customer-a");
});

for (const changes of [
  { organizationId: "org-b" },
  { campaignId: "campaign-b" },
  { campaignId: "campaign-a2" },
  { requestType: "new_store", organizationId: "org-b", campaignId: "" },
  { requestType: "new_store", organizationId: "", campaignId: "campaign-a" },
])
  test(`request rejects unauthorized or mismatched references ${JSON.stringify(changes)}`, async () => {
    const h = harness();
    assert.equal((await h.post({ ...validRequest, ...changes })).status, 403);
    assert.equal(h.writes.length, 0);
    assert.equal(h.uploads.length, 0);
  });

test("authorized request uses authenticated identity, ignoring forged identity fields", async () => {
  const h = harness();
  assert.equal(
    (
      await h.post({
        ...validRequest,
        companyId: "company-b",
        customerId: "customer-b",
      })
    ).status,
    200,
  );
  assert.equal(h.writes[0].values.company_id, "company-a");
  assert.equal(h.writes[0].values.requested_by_customer_id, "customer-a");
  assert.equal(h.queries[0].variables.customerId, "customer-a");
  assert.deepEqual(h.shops, ["test-shop"]);
});

test("new store request without organization remains supported", async () => {
  const h = harness();
  assert.equal(
    (
      await h.post({
        ...validRequest,
        requestType: "new_store",
        organizationId: "",
        campaignId: "",
      })
    ).status,
    200,
  );
});

for (const intent of ["approve-proof", "request-changes"]) {
  for (const proofHandle of [
    "proof-b",
    "proof-mismatch",
    "proof-sibling",
    "missing",
  ]) {
    test(`${intent} rejects ${proofHandle} without writes`, async () => {
      const h = harness();
      assert.equal(
        (await h.post({ intent, proofHandle, notes: "Please revise" })).status,
        403,
      );
      assert.equal(h.writes.length, 0);
      assert.equal(h.queries[0].variables.campaignType, PORTAL_TYPES.campaign);
      assert.match(h.queries[0].query, /campaigns: metaobjects/);
    });
  }
  test(`${intent} accepts consistent owned proof`, async () => {
    const h = harness();
    assert.equal(
      (await h.post({ intent, proofHandle: "proof-a", notes: "Review" }))
        .status,
      200,
    );
    assert.equal(h.writes.length, 1);
    assert.equal(h.writes[0].values.reviewed_by_customer_id, "customer-a");
    assert.equal(
      h.writes[0].values.status,
      intent === "approve-proof" ? "approved" : "changes_requested",
    );
  });
}

test("missing customer identity fails before Admin API access", async () => {
  const h = harness({ sub: "" });
  assert.equal((await h.post(validRequest)).status, 401);
  assert.equal(
    (await h.loader({ request: new Request("https://example.test") })).status,
    401,
  );
  assert.equal(h.shops.length, 0);
});

test("authentication failure cannot reach queries or mutations", async () => {
  const h = harness({ authError: new Error("Invalid session token") });
  await assert.rejects(h.post(validRequest), /Invalid session token/);
  await assert.rejects(
    h.loader({ request: new Request("https://example.test") }),
    /Invalid session token/,
  );
  assert.equal(h.shops.length, 0);
});

test("customer with no company cannot submit requests or review proofs", async () => {
  const data = fixture();
  data.customer.companyContactProfiles = [];
  const h = harness({ data });
  assert.equal((await h.post(validRequest)).status, 403);
  assert.equal(
    (await h.post({ intent: "approve-proof", proofHandle: "proof-a" })).status,
    403,
  );
  assert.equal(h.writes.length, 0);
});

test("GraphQL errors fail closed", async () => {
  const h = harness({ errors: [{ message: "Unavailable" }] });
  assert.equal((await h.post(validRequest)).status, 500);
  assert.equal(
    (await h.post({ intent: "approve-proof", proofHandle: "proof-a" })).status,
    500,
  );
  assert.equal(h.writes.length, 0);
});

test("non-object JSON is rejected", async () => {
  const h = harness();
  for (const value of [null, [], "invalid"])
    assert.equal((await h.post(value)).status, 400);
  assert.equal(h.shops.length, 0);
});

test("multipart artwork cannot upload before ownership authorization", async () => {
  const h = harness();
  const form = new FormData();
  for (const [key, value] of Object.entries({
    ...validRequest,
    organizationId: "org-b",
  }))
    form.set(key, value);
  form.set(
    "artwork_file",
    new File(["test artwork"], "test.png", { type: "image/png" }),
  );
  const response = await h.action({
    request: new Request("https://example.test/public/portal", {
      method: "POST",
      body: form,
    }),
  });
  assert.equal(response.status, 403);
  assert.equal(h.uploads.length, 0);
  assert.equal(h.writes.length, 0);
});

test("orphaned proof and previously approved proof cannot be reviewed", async () => {
  const data = fixture();
  data.proofs.nodes.push(
    node("orphan", {
      organization_store_id: "org-a",
      campaign_id: "missing",
      status: "submitted",
    }),
  );
  data.proofs.nodes.push(
    node("approved", {
      organization_store_id: "org-a",
      campaign_id: "campaign-a",
      status: "approved",
    }),
  );
  const h = harness({ data });
  assert.equal(
    (await h.post({ intent: "approve-proof", proofHandle: "orphan" })).status,
    403,
  );
  assert.equal(
    (await h.post({ intent: "approve-proof", proofHandle: "approved" })).status,
    409,
  );
  assert.equal(h.writes.length, 0);
});

test("authorized artwork upload stores private identity without returning a public URL", async () => {
  const h = harness();
  const body = new FormData();
  for (const [key, value] of Object.entries(validRequest)) body.set(key, value);
  body.set(
    "artwork_file",
    new File(["synthetic artwork"], "design.pdf", { type: "application/pdf" }),
  );
  const response = await h.action({
    request: new Request("https://example.test/public/portal", {
      method: "POST",
      body,
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(h.uploads.length, 1);
  assert.equal(h.writes[0].values.private_asset_id, "private-asset");
  assert.equal(h.writes[0].values.artwork_file, undefined);
  const result = await response.json();
  assert.equal(result.request.downloadRecordId, "saved");
  assert.equal(result.request.artworkUrl, undefined);
});
