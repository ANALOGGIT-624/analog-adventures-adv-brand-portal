import assert from "node:assert/strict";
import test from "node:test";
import {
  checkoutToken,
  createBulkCheckout,
  bulkOrderManifest,
  BULK_CHECKOUT_ATTRIBUTE,
} from "../app/lib/bulk-checkout.server.js";
import {
  validateAddress,
  saveDelivery,
} from "../app/lib/bulk-delivery.server.js";
const secret = "test-secret";
const now = new Date("2026-09-21T12:00:00Z");
const org = {
  id: "gid://shopify/Metaobject/1",
  handle: "test",
  slug: "test",
  status: "live",
  store_name: "Test Organization",
};
const campaign = {
  id: "gid://shopify/Metaobject/2",
  handle: "test-campaign",
  status: "live",
  organization_store: org.id,
  fulfillment_mode: "bulk_to_organizer",
  products: '["gid://shopify/Product/3"]',
  payout_rule: "gid://shopify/Metaobject/4",
  campaign_name: "Test Campaign",
};
const address = {
  firstName: "Test",
  lastName: "Organizer",
  address1: "123 Test Street",
  city: "Matthews",
  provinceCode: "NC",
  zip: "28105",
  countryCode: "US",
};
const node = (x) => ({
  id: x.id,
  handle: x.handle,
  fields: Object.entries(x)
    .filter(([key]) => !["id", "handle"].includes(key))
    .map(([key, value]) => ({ key, value })),
});
function harness(options = {}) {
  const saved = new Map();
  const writes = [];
  const queries = [];
  const attempts = {
    async create({ data }) {
      if (saved.has(data.id))
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      saved.set(data.id, { ...data });
      return data;
    },
    async findUnique({ where }) {
      return saved.get(where.id);
    },
    async update({ where, data }) {
      Object.assign(saved.get(where.id), data);
    },
    async delete({ where }) {
      saved.delete(where.id);
    },
  };
  const admin = {
    async graphql(query, { variables }) {
      queries.push(query);
      let data;
      if (query.includes("BulkCheckoutContext"))
        data = {
          organization: node({ ...org, ...options.org }),
          campaign: node({ ...campaign, ...options.campaign }),
          proofs: { nodes: [] },
          shop: { currencyCode: "USD" },
        };
      else if (query.includes("OrganizerDelivery"))
        data = {
          metaobjectByHandle: options.noAddress
            ? null
            : node({
                organization_id: org.id,
                address: JSON.stringify(address),
              }),
        };
      else if (query.includes("BulkCheckoutVariants"))
        data = {
          nodes: [
            {
              id: "gid://shopify/ProductVariant/5",
              availableForSale: true,
              inventoryPolicy: "DENY",
              inventoryItem: { tracked: true },
              inventoryQuantity: 10,
              price: "24.95",
              product: {
                id: "gid://shopify/Product/3",
                status: "ACTIVE",
                requiresSellingPlan: false,
              },
              ...options.variant,
            },
          ],
          rule: node({
            id: campaign.payout_rule,
            method: "fixed",
            rate: "5",
            basis: "item",
          }),
        };
      else if (query.includes("CreateBulkCheckout")) {
        writes.push(variables.input);
        if (options.networkError) throw new Error("network failure");
        data = {
          draftOrderCreate: {
            draftOrder: {
              id: "gid://shopify/DraftOrder/6",
              invoiceUrl: "https://example.test/invoice",
            },
            userErrors: options.userErrors || [],
          },
        };
      } else if (query.includes("ConfirmBulkOrder"))
        data = {
          draftOrder: {
            order: { id: options.orderId || "gid://shopify/Order/7" },
          },
        };
      else throw new Error("Unexpected query");
      return { json: async () => ({ data }) };
    },
  };
  const form = new FormData();
  form.set("checkout_token", checkoutToken(org, campaign, secret, now));
  form.set("quantity.3", "2");
  form.set("variant.3", "5");
  const run = () =>
    createBulkCheckout({
      admin,
      attempts,
      shop: "test.myshopify.com",
      slug: "test",
      form,
      secret,
      now,
    });
  return { saved, writes, queries, attempts, admin, form, run };
}
test("draft uses organizer address, zero shipping, real variants, and server attribution", async () => {
  const h = harness();
  h.form.set("shippingAddress", "attacker");
  h.form.set("price", "0");
  assert.equal(await h.run(), "https://example.test/invoice");
  const input = h.writes[0];
  assert.deepEqual(input.shippingAddress, address);
  assert.equal(input.shippingLine.priceWithCurrency.amount, "0.00");
  assert.equal(input.useCustomerDefaultAddress, false);
  assert.equal(input.lineItems[0].variantId, "gid://shopify/ProductVariant/5");
  assert.equal(input.lineItems[0].quantity, 2);
  assert.equal(input.lineItems[0].priceOverride, undefined);
  assert.equal(input.lineItems[0].requiresShipping, undefined);
  assert.ok(
    input.lineItems[0].customAttributes.find((x) => x.key === "_aa_attribution")
      .value,
  );
  assert.equal(input.customerId, undefined);
  assert.equal(input.email, undefined);
});
for (const [label, options] of [
  ["closed campaign", { campaign: { status: "closed" } }],
  [
    "individual shipping",
    { campaign: { fulfillment_mode: "individual_shipping" } },
  ],
  [
    "wrong organization",
    { campaign: { organization_store: "gid://shopify/Metaobject/99" } },
  ],
  ["closed store", { org: { status: "closed" } }],
  ["missing delivery address", { noAddress: true }],
  ["sold out", { variant: { availableForSale: false } }],
  ["insufficient inventory", { variant: { inventoryQuantity: 1 } }],
  [
    "wrong variant product",
    {
      variant: {
        product: { id: "gid://shopify/Product/99", status: "ACTIVE" },
      },
    },
  ],
  [
    "subscription product",
    {
      variant: {
        product: {
          id: "gid://shopify/Product/3",
          status: "ACTIVE",
          requiresSellingPlan: true,
        },
      },
    },
  ],
])
  test(`reject ${label} before creating draft`, async () => {
    const h = harness(options);
    await assert.rejects(h.run());
    assert.equal(h.writes.length, 0);
  });
for (const quantity of ["-1", "1.5", "101", "NaN", "0"])
  test(`reject quantity ${quantity}`, async () => {
    const h = harness();
    h.form.set("quantity.3", quantity);
    await assert.rejects(h.run());
    assert.equal(h.writes.length, 0);
  });
test("forged/expired tokens cannot query Shopify", async () => {
  for (const value of [
    "invalid",
    checkoutToken(org, campaign, secret, new Date("2026-09-20")),
  ]) {
    const h = harness();
    h.form.set("checkout_token", value);
    await assert.rejects(h.run());
    assert.equal(h.queries.length, 0);
  }
});
test("unlisted product cannot create checkout", async () => {
  const h = harness();
  h.form.set("quantity.99", "1");
  await assert.rejects(h.run());
  assert.equal(h.writes.length, 0);
});
test("same submission reuses draft; changed quantities do not reuse invoice", async () => {
  const h = harness();
  await h.run();
  await h.run();
  assert.equal(h.writes.length, 1);
  h.form.set("quantity.3", "3");
  await assert.rejects(h.run());
  assert.equal(h.writes.length, 1);
});
test("concurrent submissions create only one draft", async () => {
  const h = harness();
  await Promise.allSettled([h.run(), h.run()]);
  assert.equal(h.writes.length, 1);
});
test("ambiguous network failure never automatically repeats mutation", async () => {
  const h = harness({ networkError: true });
  await assert.rejects(h.run());
  await assert.rejects(h.run());
  assert.equal(h.writes.length, 1);
});
test("explicit Shopify rejection permits corrected retry", async () => {
  const h = harness({ userErrors: [{ message: "Invalid address" }] });
  await assert.rejects(h.run(), /Invalid address/);
  assert.equal(h.saved.size, 0);
});
test("paid bulk draft uses saved attribution, even after campaign close", async () => {
  const h = harness();
  await h.run();
  const id = [...h.saved.keys()][0];
  const payload = {
    id: 7,
    note_attributes: [{ name: BULK_CHECKOUT_ATTRIBUTE, value: id }],
    line_items: [
      { id: 8, product_id: 3, variant_id: 5, quantity: 2, price: "24.95" },
    ],
  };
  const result = await bulkOrderManifest({
    admin: h.admin,
    attempts: h.attempts,
    payload,
    shop: "test.myshopify.com",
  });
  assert.equal(result[0].campaignId, campaign.id);
  assert.equal(result[0].lineItemId, "8");
  assert.equal(result[0].payoutRuleSnapshot.rate, "5");
  await assert.rejects(
    bulkOrderManifest({
      admin: h.admin,
      attempts: h.attempts,
      payload: { ...payload, id: 99 },
      shop: "test.myshopify.com",
    }),
    /does not match/,
  );
  await assert.rejects(
    bulkOrderManifest({
      admin: h.admin,
      attempts: h.attempts,
      payload,
      shop: "other.myshopify.com",
    }),
  );
});
test("ordinary order bypasses bulk lookup", async () => {
  assert.equal(
    await bulkOrderManifest({
      payload: {},
      attempts: {
        findUnique() {
          throw new Error("unexpected");
        },
      },
    }),
    null,
  );
});
test("address is validated and unrecognized fields discarded", () => {
  assert.deepEqual(
    validateAddress({ ...address, countryCode: "us", customerId: "forged" }),
    address,
  );
  assert.throws(
    () => validateAddress({ ...address, address1: "" }),
    /Street address/,
  );
  assert.throws(
    () => validateAddress({ ...address, provinceCode: "" }),
    /State/,
  );
});
test("staff address saving rejects non-organization target", async () => {
  const admin = {
    graphql: async () => ({
      json: async () => ({ data: { metaobject: { type: "other" } } }),
    }),
  };
  await assert.rejects(
    saveDelivery(admin, org.id, address),
    /no longer exists/,
  );
});

test("untracked inventory is not treated as sold out", async () => {
  const h = harness({
    variant: { inventoryItem: { tracked: false }, inventoryQuantity: 0 },
  });
  await h.run();
  assert.equal(h.writes.length, 1);
});
