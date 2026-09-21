import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import process from "node:process";
import * as storefront from "../app/lib/public-storefront.server.js";
import * as attribution from "../app/lib/attribution.server.js";
import { checkoutToken } from "../app/lib/bulk-checkout.server.js";
const source = (
  await readFile(
    new URL("../app/routes/community.stores.$slug.jsx", import.meta.url),
    "utf8",
  )
)
  .replace(/^import[\s\S]*?;\n/gm, "")
  .replace(/export const /g, "const ");
const props = {
  organization: {
    id: "gid://shopify/Metaobject/1",
    store_name: "Test Organization",
  },
  campaign: {
    handle: "campaign",
    campaign_name: "Test Campaign",
    fulfillment_mode: "bulk_to_organizer",
  },
  products: [
    {
      legacyResourceId: "3",
      title: "Test Product",
      variants: {
        nodes: [
          {
            id: "gid://shopify/ProductVariant/5",
            legacyResourceId: "5",
            availableForSale: true,
            title: "Default Title",
            price: "24.95",
          },
        ],
      },
    },
  ],
  secret: "test-secret",
  deliveryReady: true,
};
function harness(
  auth = {
    admin: {},
    session: { shop: "test.myshopify.com" },
    liquid: (html, init) => new Response(html, init),
  },
) {
  const calls = [];
  const handlers = vm.runInNewContext(source + "\n({renderStore, action});", {
    ...storefront,
    ...attribution,
    checkoutToken,
    Response,
    process,
    authenticate: { public: { appProxy: async () => auth } },
    prisma: { bulkCheckoutAttempt: {} },
    createBulkCheckout: async (args) => {
      calls.push(args);
      return "https://checkout.example.test/invoice";
    },
  });
  return { ...handlers, calls };
}
test("bulk storefront uses one isolated checkout form and per-product quantities", () => {
  const html = harness().renderStore(props);
  assert.equal((html.match(/<form /g) || []).length, 1);
  assert.doesNotMatch(html, /action="\/cart\/add"/);
  assert.match(html, /name="quantity.3"/);
  assert.match(html, /name="variant.3"/);
  assert.match(html, /name="checkout_token"/);
  assert.match(html, /\$0 shipping/);
});
test("missing organizer address disables purchase rather than falling back to cart", () => {
  const html = harness().renderStore({ ...props, deliveryReady: false });
  assert.doesNotMatch(html, /<form /);
  assert.match(html, /not available yet/);
});
test("individual shipping keeps regular cart", () => {
  const html = harness().renderStore({
    ...props,
    campaign: { ...props.campaign, fulfillment_mode: "individual_shipping" },
  });
  assert.match(html, /action="\/cart\/add"/);
  assert.doesNotMatch(html, /name="checkout_token"/);
});
test("proxy authentication required before creating a draft", async () => {
  const h = harness({ admin: undefined, session: undefined });
  const response = await h.action({
    request: new Request("https://example.test", { method: "POST" }),
    params: { slug: "test" },
  });
  assert.equal(response.status, 401);
  assert.equal(h.calls.length, 0);
});
test("successful proxy POST redirects to Shopify invoice", async () => {
  const h = harness();
  const response = await h.action({
    request: new Request("https://example.test", {
      method: "POST",
      body: new FormData(),
    }),
    params: { slug: "test" },
  });
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("Location"),
    "https://checkout.example.test/invoice",
  );
  assert.equal(h.calls[0].shop, "test.myshopify.com");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
