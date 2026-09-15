import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateProceedsCents,
  reconcileCampaignOrders,
} from "../app/lib/payout-reconciliation.server.js";

const campaignId = "gid://shopify/Metaobject/100";

function order({
  lineId = "gid://shopify/LineItem/10",
  amount = "100.00",
  quantity = 2,
  method = "fixed_per_unit",
  basis = "eligible_unit",
  rate = "5.00",
  refunds = [],
  cancelledAt = null,
} = {}) {
  return {
    id: "gid://shopify/Order/1",
    name: "#1001",
    createdAt: "2026-09-15T12:00:00Z",
    cancelledAt,
    currencyCode: "USD",
    attributionManifest: {
      jsonValue: {
        version: 1,
        lines: [
          {
            lineItemId: lineId.split("/").pop(),
            campaignId,
            quantity,
            linePrice: String(Number(amount) / quantity),
            payoutRuleSnapshot: { method, basis, rate },
          },
        ],
      },
    },
    lineItems: {
      nodes: [
        {
          id: lineId,
          quantity,
          discountedTotalSet: {
            shopMoney: { amount, currencyCode: "USD" },
          },
        },
      ],
    },
    refunds,
  };
}

function refund(lineId, quantity, amount) {
  return {
    id: "gid://shopify/Refund/20",
    refundLineItems: {
      nodes: [
        {
          quantity,
          subtotalSet: {
            shopMoney: { amount, currencyCode: "USD" },
          },
          lineItem: { id: lineId },
        },
      ],
    },
  };
}

test("fixed proceeds use eligible units after refunds", () => {
  const lineId = "gid://shopify/LineItem/10";
  const result = reconcileCampaignOrders(
    [order({ refunds: [refund(lineId, 1, "50.00")] })],
    campaignId,
  );

  assert.equal(result.orderCount, 1);
  assert.equal(result.units, 2);
  assert.equal(result.refundedUnits, 1);
  assert.equal(result.grossRevenueCents, 10000);
  assert.equal(result.refundsCents, 5000);
  assert.equal(result.proceedsCents, 500);
});

test("percentage proceeds use revenue after refunds", () => {
  const lineId = "gid://shopify/LineItem/10";
  const result = reconcileCampaignOrders(
    [
      order({
        method: "percentage",
        basis: "net_merchandise_revenue",
        rate: "10",
        refunds: [refund(lineId, 1, "25.00")],
      }),
    ],
    campaignId,
  );

  assert.equal(result.proceedsCents, 750);
});

test("cancelled orders are fully reversed", () => {
  const result = reconcileCampaignOrders(
    [order({ cancelledAt: "2026-09-16T12:00:00Z" })],
    campaignId,
  );

  assert.equal(result.refundsCents, 10000);
  assert.equal(result.refundedUnits, 2);
  assert.equal(result.proceedsCents, 0);
});

test("unsupported payout methods are flagged and do not pay", () => {
  const result = reconcileCampaignOrders(
    [order({ method: "profit_share", basis: "profit" })],
    campaignId,
  );

  assert.equal(result.unsupportedRuleCount, 1);
  assert.equal(result.proceedsCents, 0);
});

test("proceeds helper rounds percentage calculations to cents", () => {
  assert.equal(
    calculateProceedsCents({
      payoutRuleSnapshot: { method: "percentage", rate: "12.5" },
      eligibleRevenueCents: 999,
      eligibleQuantity: 1,
    }),
    125,
  );
});
