const CENTS_PER_UNIT = 100;

export function toCents(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount * CENTS_PER_UNIT) : 0;
}

export function fromCents(cents) {
  return (Number(cents || 0) / CENTS_PER_UNIT).toFixed(2);
}

function resourceId(value) {
  return String(value || "")
    .split("/")
    .pop();
}

function payoutMethod(snapshot = {}) {
  const method = String(snapshot.method || "").toLowerCase();
  const basis = String(snapshot.basis || "").toLowerCase();
  if (method.includes("percent") || basis.includes("percent")) {
    return "percentage";
  }
  if (
    method.includes("fixed") ||
    method.includes("unit") ||
    basis.includes("unit")
  ) {
    return "fixed_per_unit";
  }
  return "unsupported";
}

function requiresFulfillment(snapshot = {}) {
  return String(snapshot.basis || "")
    .toLowerCase()
    .includes("fulfilled");
}

export function calculateProceedsCents({
  payoutRuleSnapshot,
  eligibleRevenueCents,
  eligibleQuantity,
}) {
  const rate = Number(payoutRuleSnapshot?.rate || 0);
  if (!Number.isFinite(rate) || rate < 0) return 0;

  switch (payoutMethod(payoutRuleSnapshot)) {
    case "fixed_per_unit":
      return Math.round(rate * CENTS_PER_UNIT * eligibleQuantity);
    case "percentage":
      return Math.round((eligibleRevenueCents * rate) / 100);
    default:
      return 0;
  }
}

function manifestForOrder(order) {
  const value = order.attributionManifest?.jsonValue;
  return value && Array.isArray(value.lines) ? value : { lines: [] };
}

function lineAmountCents(lineItem, manifestLine) {
  const amount = lineItem?.discountedTotalSet?.shopMoney?.amount;
  if (amount !== undefined && amount !== null) return toCents(amount);
  return toCents(manifestLine.linePrice) * Number(manifestLine.quantity || 0);
}

function refundsForLine(order, lineItemId) {
  const id = resourceId(lineItemId);
  return (order.refunds || []).reduce(
    (totals, refund) => {
      for (const refundLine of refund.refundLineItems?.nodes || []) {
        if (resourceId(refundLine.lineItem?.id) !== id) continue;
        totals.quantity += Number(refundLine.quantity || 0);
        totals.cents += toCents(refundLine.subtotalSet?.shopMoney?.amount || 0);
      }
      return totals;
    },
    { quantity: 0, cents: 0 },
  );
}

export function reconcileCampaignOrders(orders, campaignId) {
  const result = {
    campaignId,
    orderCount: 0,
    units: 0,
    refundedUnits: 0,
    eligibleUnits: 0,
    grossRevenueCents: 0,
    refundsCents: 0,
    proceedsCents: 0,
    currency: "USD",
    firstOrderAt: null,
    lastOrderAt: null,
    orders: [],
    unsupportedRuleCount: 0,
    settlementDelayDays: 0,
  };

  for (const order of orders || []) {
    const manifestLines = manifestForOrder(order).lines.filter(
      (line) => line.campaignId === campaignId,
    );
    if (!manifestLines.length) continue;

    let orderGrossCents = 0;
    let orderRefundsCents = 0;
    let orderProceedsCents = 0;
    let orderUnits = 0;
    let orderRefundedUnits = 0;
    let orderEligibleUnits = 0;
    let orderCurrency = order.currencyCode || result.currency;

    for (const manifestLine of manifestLines) {
      const lineItem = (order.lineItems?.nodes || []).find(
        ({ id }) => resourceId(id) === resourceId(manifestLine.lineItemId),
      );
      orderCurrency =
        lineItem?.discountedTotalSet?.shopMoney?.currencyCode || orderCurrency;
      const quantity = Number(manifestLine.quantity || lineItem?.quantity || 0);
      const grossCents = lineAmountCents(lineItem, manifestLine);
      const refunded = refundsForLine(order, manifestLine.lineItemId);
      const isCancelled = Boolean(order.cancelledAt);
      const refundCents = isCancelled
        ? grossCents
        : Math.min(grossCents, refunded.cents);
      const refundedQuantity = isCancelled
        ? quantity
        : Math.min(quantity, refunded.quantity);
      const eligibleRevenueCents = Math.max(0, grossCents - refundCents);
      const currentQuantity = Number(lineItem?.currentQuantity);
      const nonRefundedQuantity = isCancelled
        ? 0
        : Number.isFinite(currentQuantity)
          ? Math.min(quantity, Math.max(0, currentQuantity))
          : Math.max(0, quantity - refundedQuantity);
      const unfulfilledQuantity = Number(lineItem?.unfulfilledQuantity);
      const eligibleQuantity = requiresFulfillment(
        manifestLine.payoutRuleSnapshot,
      )
        ? Number.isFinite(unfulfilledQuantity)
          ? Math.max(0, nonRefundedQuantity - unfulfilledQuantity)
          : 0
        : nonRefundedQuantity;
      const proceedsCents = calculateProceedsCents({
        payoutRuleSnapshot: manifestLine.payoutRuleSnapshot,
        eligibleRevenueCents,
        eligibleQuantity,
      });

      if (payoutMethod(manifestLine.payoutRuleSnapshot) === "unsupported") {
        result.unsupportedRuleCount += 1;
      }
      result.settlementDelayDays = Math.max(
        result.settlementDelayDays,
        Number(manifestLine.payoutRuleSnapshot?.settlementDelayDays || 0),
      );
      orderGrossCents += grossCents;
      orderRefundsCents += refundCents;
      orderProceedsCents += proceedsCents;
      orderUnits += quantity;
      orderRefundedUnits += refundedQuantity;
      orderEligibleUnits += eligibleQuantity;
    }

    const createdAt = order.createdAt || null;
    result.orderCount += 1;
    result.units += orderUnits;
    result.refundedUnits += orderRefundedUnits;
    result.eligibleUnits += orderEligibleUnits;
    result.grossRevenueCents += orderGrossCents;
    result.refundsCents += orderRefundsCents;
    result.proceedsCents += orderProceedsCents;
    result.currency = orderCurrency;
    result.firstOrderAt =
      !result.firstOrderAt || createdAt < result.firstOrderAt
        ? createdAt
        : result.firstOrderAt;
    result.lastOrderAt =
      !result.lastOrderAt || createdAt > result.lastOrderAt
        ? createdAt
        : result.lastOrderAt;
    result.orders.push({
      id: order.id,
      name: order.name,
      createdAt,
      units: orderUnits,
      refundedUnits: orderRefundedUnits,
      eligibleUnits: orderEligibleUnits,
      grossRevenueCents: orderGrossCents,
      refundsCents: orderRefundsCents,
      proceedsCents: orderProceedsCents,
    });
  }

  return result;
}

const ORDERS_QUERY = `#graphql
  query PayoutReconciliationOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        currencyCode
        attributionManifest: metafield(key: "attribution_manifest") {
          jsonValue
        }
        lineItems(first: 100) {
          nodes {
            id
            quantity
            currentQuantity
            unfulfilledQuantity
            discountedTotalSet { shopMoney { amount currencyCode } }
          }
        }
        refunds(first: 100) {
          id
          createdAt
          refundLineItems(first: 100) {
            nodes {
              quantity
              subtotalSet { shopMoney { amount currencyCode } }
              lineItem { id }
            }
          }
        }
      }
    }
  }
`;

export async function getAttributedOrdersForReconciliation(admin) {
  const orders = [];
  let after = null;

  do {
    const response = await admin.graphql(ORDERS_QUERY, {
      variables: { first: 100, after },
    });
    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(payload.errors.map(({ message }) => message).join("; "));
    }

    const connection = payload.data.orders;
    orders.push(
      ...connection.nodes.filter(
        ({ attributionManifest }) => attributionManifest?.jsonValue,
      ),
    );
    after = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null;
  } while (after);

  return orders;
}
