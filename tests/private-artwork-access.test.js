import assert from "node:assert/strict";
import test from "node:test";
import {
  authorizedArtwork,
  artworkShop,
} from "../app/lib/private-artwork-access.server.js";
import { normalizeMetaobject } from "../app/lib/brand-portal.server.js";
import { proofValues } from "../app/lib/proof-workflow.server.js";
import { updateOrganizationRequestValues } from "../app/lib/organization-request.server.js";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const id = "gid://shopify/Metaobject/1";
const privateId = "12345678-abcd-4000-8000-123456789abc";
const node = (type, fields) => ({
  id,
  type,
  fields: Object.entries(fields).map(([key, value]) => ({ key, value })),
});
function fixture(options = {}) {
  const kind = options.kind || "proof";
  const recordType =
    kind === "proof"
      ? "app--123--artwork_proof"
      : "app--123--organization_request";
  const fields = {
    private_asset_id: privateId,
    organization_store_id: "org1",
    campaign_id: "campaign1",
    company_id: "company1",
    original_filename: "proof.svg",
    artwork_filename: "source.pdf",
    ...options.fields,
  };
  const calls = [];
  const admin = {
    async graphql(document) {
      calls.push(document);
      if (options.error)
        return { json: async () => ({ errors: [{ message: "API error" }] }) };
      let data;
      if (document.includes("PrivateArtworkRecord"))
        data = {
          metaobject: options.missing
            ? null
            : node(options.recordType || recordType, fields),
          metaobjectDefinitionByType: { type: recordType },
        };
      if (document.includes("PrivateArtworkOrganization"))
        data = {
          metaobject: node("aa_organization_store", {
            company: options.orgCompany || "company1",
          }),
        };
      if (document.includes("PrivateArtworkCampaign"))
        data = {
          metaobject: node("aa_store_campaign", {
            organization_store: options.campaignOrg || "org1",
          }),
        };
      if (document.includes("PrivateArtworkCustomer"))
        data = {
          customer: {
            companyContactProfiles: (options.companies || ["company1"]).map(
              (id) => ({ company: { id } }),
            ),
          },
        };
      return { json: async () => ({ data }) };
    },
  };
  return {
    calls,
    run: (overrides = {}) =>
      authorizedArtwork({
        admin,
        shop: "https://test.myshopify.com",
        customerId: "customer1",
        kind,
        recordId: id,
        ...overrides,
      }),
  };
}

test("authorized current customer resolves only stable private artwork identity", async () => {
  assert.deepEqual(await fixture().run(), {
    shop: "test.myshopify.com",
    assetId: privateId,
    filename: "proof.svg",
  });
});
for (const [name, options] of [
  ["wrong company", { companies: ["company2"] }],
  ["removed membership", { companies: [] }],
  ["mismatched campaign", { campaignOrg: "org2" }],
  ["wrong record type", { recordType: "app--456--artwork_proof" }],
  ["missing record", { missing: true }],
  ["public legacy file", { fields: { private_asset_id: "" } }],
  ["orphan proof", { fields: { organization_store_id: "" } }],
  [
    "request company mismatch",
    { kind: "request", fields: { company_id: "company2" } },
  ],
])
  test(`private download rejects ${name}`, async () => {
    await assert.rejects(
      fixture(options).run(),
      (error) => error instanceof Response && error.status === 404,
    );
  });
test("signed-out and malformed requests fail before querying Shopify", async () => {
  for (const input of [
    { customerId: "" },
    { kind: "other" },
    { recordId: "../../asset" },
  ]) {
    const f = fixture();
    await assert.rejects(f.run(input));
    assert.equal(f.calls.length, 0);
  }
});
test("authenticated staff can access valid historical proof without customer membership", async () => {
  const f = fixture({ companies: [] });
  assert.equal(
    (await f.run({ staff: true, customerId: undefined })).assetId,
    privateId,
  );
  assert.ok(f.calls.every((x) => !x.includes("PrivateArtworkCustomer")));
});
test("new-store request without an organization checks current company membership", async () => {
  const fields = {
    organization_store_id: "",
    campaign_id: "",
    request_type: "new_store",
  };
  assert.equal(
    (await fixture({ kind: "request", fields }).run()).filename,
    "source.pdf",
  );
  await assert.rejects(
    fixture({ kind: "request", fields, companies: [] }).run(),
  );
});
test("GraphQL failure cannot produce an asset", async () => {
  await assert.rejects(fixture({ error: true }).run());
});
test("shop identities cannot redirect storage to an arbitrary host", () => {
  assert.equal(
    artworkShop("https://test.myshopify.com/"),
    "test.myshopify.com",
  );
  for (const input of [
    "http://test.myshopify.com",
    "test.myshopify.com.evil.test",
    "test.myshopify.com/path",
    "test.myshopify.com@evil.test",
  ])
    assert.throws(() => artworkShop(input));
});
test("staff proof links replace stale public URLs with authenticated app routes", () => {
  const record = normalizeMetaobject(
    node("app--123--artwork_proof", {
      proof_id: "PROOF1",
      private_asset_id: privateId,
    }),
  );
  assert.equal(
    record.asset_file_url,
    `/app/artwork?kind=proof&id=${encodeURIComponent(id)}`,
  );
});
test("proof and request status changes preserve private file identity", () => {
  assert.equal(
    proofValues({ private_asset_id: privateId }, { status: "approved" })
      .private_asset_id,
    privateId,
  );
  assert.equal(
    updateOrganizationRequestValues(
      { status: "submitted", private_asset_id: privateId },
      "in_review",
      "Reviewed",
    ).private_asset_id,
    privateId,
  );
});

const source = (
  await readFile(
    new URL("../app/routes/public.artwork.jsx", import.meta.url),
    "utf8",
  )
)
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export const /g, "const ");
function route({ sub = "customer1", deny, authError } = {}) {
  let signed = 0,
    lookedUp = 0;
  const handlers = vm.runInNewContext(source + "\n({action});", {
    Response,
    authenticate: {
      public: {
        customerAccount: async () => {
          if (authError) throw authError;
          return {
            sessionToken: { sub, dest: "test.myshopify.com" },
            cors: (x) => x,
          };
        },
      },
    },
    unauthenticated: { admin: async () => ({ admin: {} }) },
    authorizedArtwork: async (args) => {
      lookedUp++;
      assert.equal(args.customerId, sub);
      assert.equal(args.shop, "test.myshopify.com");
      if (deny) throw new Response("no", { status: 404 });
      return {};
    },
    createPrivateArtworkStorage: () => ({
      downloadUrl: async () => {
        signed++;
        return "https://example.r2.cloudflarestorage.com/signed";
      },
    }),
  });
  return {
    run: (
      body = {
        kind: "proof",
        recordId: id,
        customerId: "forged",
        shop: "other",
      },
    ) =>
      handlers.action({
        request: new Request("https://app.test/public/artwork", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      }),
    counts: () => ({ signed, lookedUp }),
  };
}
test("download route ignores caller identity and prevents caching", async () => {
  const h = route();
  const response = await h.run();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(h.counts().signed, 1);
});
test("download route never signs for denied or missing customer", async () => {
  for (const options of [{ sub: "" }, { deny: true }]) {
    const h = route(options);
    assert.ok((await h.run()).status >= 400);
    assert.equal(h.counts().signed, 0);
  }
});
test("invalid body or failed session verification cannot reach download signing", async () => {
  const h = route();
  assert.equal((await h.run([])).status, 400);
  assert.deepEqual(h.counts(), { signed: 0, lookedUp: 0 });
  const invalid = route({
    authError: new Response("expired", { status: 401 }),
  });
  await assert.rejects(invalid.run());
  assert.equal(invalid.counts().signed, 0);
});
