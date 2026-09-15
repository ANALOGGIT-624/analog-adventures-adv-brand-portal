import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  isCampaignLive,
  referenceIds,
  safeColor,
} from "../app/lib/public-storefront.server.js";

test("referenceIds parses Shopify list-reference values", () => {
  assert.deepEqual(referenceIds('["gid://shopify/Product/1"]'), [
    "gid://shopify/Product/1",
  ]);
  assert.deepEqual(referenceIds("gid://shopify/Product/2"), [
    "gid://shopify/Product/2",
  ]);
});

test("isCampaignLive checks status and campaign window", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  assert.equal(
    isCampaignLive(
      {
        status: "live",
        starts_at: "2026-09-15T00:00:00Z",
        closes_at: "2026-11-16T23:59:59Z",
      },
      now,
    ),
    true,
  );
  assert.equal(isCampaignLive({ status: "draft" }, now), false);
});

test("public values are escaped and colors are constrained", () => {
  assert.equal(escapeHtml('<script>"x"</script>'), "&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
  assert.equal(safeColor("#123abc", "#000000"), "#123abc");
  assert.equal(safeColor("red; color: transparent", "#000000"), "#000000");
});
