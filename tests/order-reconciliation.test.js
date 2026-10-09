import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileBatch,
  orderPayload,
} from "../app/lib/order-reconciliation.js";
const order = (id, tagged = true) => ({
  id,
  name: "#" + id,
  createdAt: "2026-10-09T00:00:00Z",
  customAttributes: [],
  lineItems: {
    pageInfo: { hasNextPage: false },
    nodes: [
      {
        id: "gid://shopify/LineItem/123",
        quantity: 2,
        product: { id: "gid://shopify/Product/456" },
        variant: { id: "gid://shopify/ProductVariant/789" },
        originalUnitPriceSet: { shopMoney: { amount: "10.00" } },
        customAttributes: tagged
          ? [{ key: "_aa_attribution", value: "signed-token" }]
          : [],
      },
    ],
  },
});
function fixture(pages, processOrder) {
  let state = null;
  const calls = [];
  return {
    get state() {
      return state;
    },
    calls,
    run: () =>
      reconcileBatch({
        now: new Date("2026-10-09"),
        pages: 1,
        processOrder,
        load: async () => structuredClone(state),
        save: async (s) => {
          state = structuredClone(s);
        },
        admin: {
          graphql: async (_, args) => {
            calls.push(args.variables);
            const page = pages.shift();
            if (page instanceof Error) throw page;
            return Response.json({ data: { orders: page } });
          },
        },
      }),
  };
}
const page = (nodes, more = false, cursor = null) => ({
  nodes,
  pageInfo: { hasNextPage: more, endCursor: cursor },
});
test("missed orders are processed and cursor resumes after restart", async () => {
  const seen = [];
  const h = fixture(
    [page([order("1")], true, "next"), page([order("2")])],
    async (p) => {
      seen.push(p.admin_graphql_api_id);
      return "recovered";
    },
  );
  await h.run();
  assert.equal(h.state.cursor, "next");
  await h.run();
  assert.equal(h.calls[1].after, "next");
  assert.deepEqual(seen, ["1", "2"]);
  assert.equal(h.state.recovered, 2);
  assert.equal(h.state.windowEnd, null);
});
test("failed scan does not advance saved progress", async () => {
  const h = fixture(
    [page([order("1")], true, "next"), Error("network")],
    async () => "verified",
  );
  await h.run();
  const before = structuredClone(h.state);
  await assert.rejects(h.run());
  assert.deepEqual(h.state, before);
});
test("uncertain tagged order stays on review list and retries next sweep", async () => {
  let ready = false;
  const h = fixture([page([order("1")]), page([order("1")])], async () =>
    ready ? "recovered" : "unattributed",
  );
  await h.run();
  assert.equal(h.state.issues.length, 1);
  ready = true;
  await h.run();
  assert.equal(h.state.issues.length, 0);
  assert.equal(h.state.recovered, 1);
});
test("ordinary orders are ignored and existing attribution counts as unchanged", async () => {
  const h = fixture([page([order("1", false), order("2")])], async (p) =>
    p.admin_graphql_api_id === "1" ? "unattributed" : "verified",
  );
  await h.run();
  assert.equal(h.state.issues.length, 0);
  assert.equal(h.state.recovered, 0);
});
test("truncated line list is held for review without calling writer", async () => {
  const o = order("1");
  o.lineItems.pageInfo.hasNextPage = true;
  const h = fixture([page([o])], async () => assert.fail("writer reached"));
  await h.run();
  assert.equal(h.state.issues.length, 1);
});
test("GraphQL order conversion preserves original quantity, price and checkout attributes", () => {
  const o = order("1");
  o.customAttributes = [{ key: "_aa_bulk_checkout", value: "attempt" }];
  const p = orderPayload(o);
  assert.equal(p.note_attributes[0].name, "_aa_bulk_checkout");
  assert.equal(p.line_items[0].variant_id, "789");
  assert.equal(p.line_items[0].quantity, 2);
  assert.equal(p.line_items[0].price, "10.00");
});
