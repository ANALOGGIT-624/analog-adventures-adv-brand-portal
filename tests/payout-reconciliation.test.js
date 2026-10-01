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
  currentQuantity = quantity,
  unfulfilledQuantity = 0,
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
          currentQuantity,
          unfulfilledQuantity,
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
    [
      order({
        currentQuantity: 1,
        refunds: [refund(lineId, 1, "50.00")],
      }),
    ],
    campaignId,
  );

  assert.equal(result.orderCount, 1);
  assert.equal(result.units, 2);
  assert.equal(result.refundedUnits, 1);
  assert.equal(result.eligibleUnits, 1);
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

test("fulfilled-unit proceeds exclude units that are not fulfilled", () => {
  const result = reconcileCampaignOrders(
    [
      order({
        basis: "eligible_fulfilled_units",
        quantity: 2,
        currentQuantity: 2,
        unfulfilledQuantity: 1,
      }),
    ],
    campaignId,
  );

  assert.equal(result.eligibleUnits, 1);
  assert.equal(result.proceedsCents, 500);
});

test("fulfilled-unit proceeds default to zero without fulfillment data", () => {
  const attributedOrder = order({ basis: "eligible_fulfilled_units" });
  delete attributedOrder.lineItems.nodes[0].unfulfilledQuantity;

  const result = reconcileCampaignOrders([attributedOrder], campaignId);

  assert.equal(result.eligibleUnits, 0);
  assert.equal(result.proceedsCents, 0);
});

test("non-fulfillment unit rules continue to use non-refunded units", () => {
  const result = reconcileCampaignOrders(
    [order({ basis: "eligible_unit", unfulfilledQuantity: 2 })],
    campaignId,
  );

  assert.equal(result.eligibleUnits, 2);
  assert.equal(result.proceedsCents, 1000);
});

test("cancelled orders are fully reversed", () => {
  const result = reconcileCampaignOrders(
    [order({ cancelledAt: "2026-09-16T12:00:00Z" })],
    campaignId,
  );

  assert.equal(result.refundsCents, 10000);
  assert.equal(result.refundedUnits, 2);
  assert.equal(result.eligibleUnits, 0);
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

function adjustmentRefund(
  amount,
  { status = "SUCCESS", tax = "0", item } = {},
) {
  return {
    id: "adjustment",
    refundLineItems: {
      nodes: item
        ? refund("gid://shopify/LineItem/10", 1, item).refundLineItems.nodes
        : [],
    },
    orderAdjustments: {
      nodes: [
        {
          reason: "REFUND_DISCREPANCY",
          amountSet: { shopMoney: { amount } },
          taxAmountSet: { shopMoney: { amount: tax } },
        },
      ],
    },
    transactions: { nodes: [{ kind: "REFUND", status }] },
  };
}

test("successful $10 goodwill refund reports money without returning units", () => {
  const result = reconcileCampaignOrders(
    [
      order({
        amount: "949.95",
        quantity: 1,
        basis: "eligible_fulfilled_units",
        refunds: [adjustmentRefund("-10")],
      }),
    ],
    campaignId,
  );
  assert.equal(result.refundsCents, 1000);
  assert.equal(result.refundedUnits, 0);
  assert.equal(result.eligibleUnits, 1);
  assert.equal(result.proceedsCents, 500);
  assert.equal(result.refundReviewCount, 0);
});

test("amount-only refund reduces percentage proceeds", () => {
  const result = reconcileCampaignOrders(
    [
      order({
        method: "percentage",
        rate: "10",
        refunds: [adjustmentRefund("-10")],
      }),
    ],
    campaignId,
  );
  assert.equal(result.proceedsCents, 900);
});

test("discrepancy allocation includes other campaigns and conserves rounded cents", () => {
  const source = order({
    amount: "1",
    quantity: 1,
    refunds: [adjustmentRefund("-0.01")],
  });
  const second = structuredClone(source.lineItems.nodes[0]);
  second.id = "gid://shopify/LineItem/11";
  source.lineItems.nodes.push(second);
  source.attributionManifest.jsonValue.lines.push({
    ...source.attributionManifest.jsonValue.lines[0],
    lineItemId: "11",
    campaignId: "other",
  });
  const first = reconcileCampaignOrders([source], campaignId);
  const other = reconcileCampaignOrders([source], "other");
  assert.equal(first.refundsCents + other.refundsCents, 1);
  assert.equal(first.refundsCents, 1);
  assert.equal(other.refundsCents, 0);
});

test("positive discrepancy reduces item refund without double counting", () => {
  const result = reconcileCampaignOrders(
    [order({ refunds: [adjustmentRefund("10", { item: "50" })] })],
    campaignId,
  );
  assert.equal(result.refundsCents, 4000);
  assert.equal(result.refundedUnits, 1);
});

test("shipping refund totals are not merchandise refunds", () => {
  const source = order({
    refunds: [
      {
        ...adjustmentRefund("0"),
        totalRefundedSet: { shopMoney: { amount: "10" } },
        refundShippingLines: {
          nodes: [{ subtotalAmountSet: { shopMoney: { amount: "10" } } }],
        },
      },
    ],
  });
  assert.equal(reconcileCampaignOrders([source], campaignId).refundsCents, 0);
});

test("pending, failed, tax-adjusted, excessive and truncated refunds require review", () => {
  for (const entry of [
    adjustmentRefund("-10", { status: "PENDING" }),
    adjustmentRefund("-10", { status: "FAILURE" }),
    adjustmentRefund("-10", { tax: "-1" }),
    adjustmentRefund("-101"),
    {
      ...adjustmentRefund("-10"),
      orderAdjustments: { nodes: [], pageInfo: { hasNextPage: true } },
    },
  ]) {
    assert.equal(
      reconcileCampaignOrders([order({ refunds: [entry] })], campaignId)
        .refundReviewCount,
      1,
    );
  }
});
