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

// Discrepancies are signed: a negative adjustment means additional money
// refunded without returning units. Allocate across all merchandise, including
// lines belonging to other campaigns, using stable largest-remainder cents.
function allocateCents(amount, weights) {
  const total = weights.reduce((sum, row) => sum + row.weight, 0);
  if (!total || !amount) return new Map();
  const rows = weights.map(({ id, weight }) => {
    const exact = (amount * weight) / total;
    return { id, cents: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = amount - rows.reduce((sum, row) => sum + row.cents, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (const row of rows) if (remaining-- > 0) row.cents += 1;
  return new Map(rows.map(({ id, cents }) => [id, cents]));
}

function refundsForOrder(order) {
  const totals = new Map(
    (order.lineItems?.nodes || []).map((line) => [
      resourceId(line.id),
      {
        quantity: 0,
        cents: 0,
        gross: toCents(line.discountedTotalSet?.shopMoney?.amount),
      },
    ]),
  );
  let needsReview = Boolean(
    order.lineItems?.pageInfo?.hasNextPage ||
    (order.refunds || []).length >= 100,
  );
  for (const refund of [...(order.refunds || [])].sort((a, b) =>
    String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id)),
  )) {
    if (
      [
        refund.refundLineItems,
        refund.orderAdjustments,
        refund.transactions,
      ].some((c) => c?.pageInfo?.hasNextPage)
    )
      needsReview = true;
    const transactions = refund.transactions?.nodes || [];
    if (
      refund.transactions &&
      (!transactions.length ||
        transactions.some((t) => t.kind === "REFUND" && t.status !== "SUCCESS"))
    )
      needsReview = true;
    const itemRefunds = new Map();
    for (const line of refund.refundLineItems?.nodes || []) {
      const id = resourceId(line.lineItem?.id);
      const total = totals.get(id);
      if (!total) {
        needsReview = true;
        continue;
      }
      const cents = toCents(line.subtotalSet?.shopMoney?.amount);
      total.quantity += Number(line.quantity || 0);
      total.cents += cents;
      itemRefunds.set(id, (itemRefunds.get(id) || 0) + cents);
    }
    let adjustment = 0;
    for (const entry of refund.orderAdjustments?.nodes || []) {
      if (
        entry.reason !== "REFUND_DISCREPANCY" ||
        toCents(entry.taxAmountSet?.shopMoney?.amount) !== 0
      ) {
        needsReview = true;
        continue;
      }
      adjustment -= toCents(entry.amountSet?.shopMoney?.amount);
    }
    const weights = [...totals].map(([id, total]) => ({
      id,
      weight:
        adjustment >= 0
          ? Math.max(0, total.gross - total.cents)
          : Math.max(0, itemRefunds.get(id) || 0),
    }));
    const capacity = weights.reduce((sum, row) => sum + row.weight, 0);
    if (Math.abs(adjustment) > capacity) needsReview = true;
    for (const [id, cents] of allocateCents(
      Math.min(Math.abs(adjustment), capacity),
      weights,
    )) {
      totals.get(id).cents += adjustment >= 0 ? cents : -cents;
    }
  }
  if (
    [...totals.values()].some((row) => row.cents < 0 || row.cents > row.gross)
  )
    needsReview = true;
  return { totals, needsReview };
}

function visibleCustomizations(attributes = []) {
  return attributes
    .filter(({ key, value }) => key && value && !String(key).startsWith("_"))
    .map(({ key, value }) => `${key}: ${value}`)
    .join(" | ");
}

function fulfillmentState({ cancelled, currentQuantity, unfulfilledQuantity }) {
  if (cancelled || currentQuantity <= 0) return "cancelled_or_refunded";
  if (!Number.isFinite(unfulfilledQuantity)) return "unknown";
  if (unfulfilledQuantity <= 0) return "fulfilled";
  if (unfulfilledQuantity < currentQuantity) return "partially_fulfilled";
  return "unfulfilled";
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
    refundReviewCount: 0,
    settlementDelayDays: 0,
  };

  for (const order of orders || []) {
    const manifestLines = manifestForOrder(order).lines.filter(
      (line) => line.campaignId === campaignId,
    );
    if (!manifestLines.length) continue;

    const refundSummary = refundsForOrder(order);
    if (refundSummary.needsReview) result.refundReviewCount += 1;
    let orderGrossCents = 0;
    let orderRefundsCents = 0;
    let orderProceedsCents = 0;
    let orderUnits = 0;
    let orderRefundedUnits = 0;
    let orderEligibleUnits = 0;
    let orderCurrency = order.currencyCode || result.currency;
    const orderLines = [];

    for (const manifestLine of manifestLines) {
      const lineItem = (order.lineItems?.nodes || []).find(
        ({ id }) => resourceId(id) === resourceId(manifestLine.lineItemId),
      );
      orderCurrency =
        lineItem?.discountedTotalSet?.shopMoney?.currencyCode || orderCurrency;
      const quantity = Number(manifestLine.quantity || lineItem?.quantity || 0);
      const grossCents = lineAmountCents(lineItem, manifestLine);
      const refunded = refundSummary.totals.get(
        resourceId(manifestLine.lineItemId),
      ) || { quantity: 0, cents: 0 };
      const isCancelled = Boolean(order.cancelledAt);
      const refundCents = isCancelled
        ? grossCents
        : Math.max(0, Math.min(grossCents, refunded.cents));
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
      orderLines.push({
        lineItemId: manifestLine.lineItemId,
        productId: manifestLine.productId || null,
        variantId: manifestLine.variantId || null,
        itemName: lineItem?.name || "Attributed item",
        sku: lineItem?.sku || "",
        variantTitle: lineItem?.variantTitle || "",
        customization: visibleCustomizations(lineItem?.customAttributes),
        orderedUnits: quantity,
        currentUnits: nonRefundedQuantity,
        refundedUnits: refundedQuantity,
        eligibleUnits: eligibleQuantity,
        unfulfilledUnits: Number.isFinite(unfulfilledQuantity)
          ? Math.min(nonRefundedQuantity, Math.max(0, unfulfilledQuantity))
          : null,
        fulfillmentState: fulfillmentState({
          cancelled: isCancelled,
          currentQuantity: nonRefundedQuantity,
          unfulfilledQuantity,
        }),
        grossRevenueCents: grossCents,
        refundsCents: refundCents,
        proceedsCents,
        proofId: manifestLine.artworkProofSnapshot?.id || null,
        proofVersion: manifestLine.artworkProofSnapshot?.version || null,
        proofContentHash:
          manifestLine.artworkProofSnapshot?.contentHash || null,
      });
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
      lines: orderLines,
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
          pageInfo { hasNextPage }
          nodes {
            id
            name
            sku
            variantTitle
            quantity
            currentQuantity
            unfulfilledQuantity
            customAttributes { key value }
            discountedTotalSet { shopMoney { amount currencyCode } }
          }
        }
        refunds(first: 100) {
          id
          createdAt
          orderAdjustments(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              reason
              amountSet { shopMoney { amount currencyCode } }
              taxAmountSet { shopMoney { amount currencyCode } }
            }
          }
          transactions(first: 100) {
            pageInfo { hasNextPage }
            nodes { kind status }
          }
          refundLineItems(first: 100) {
            pageInfo { hasNextPage }
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
