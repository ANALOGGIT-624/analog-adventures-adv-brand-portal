export const PRODUCTION_BATCH_STATUSES = [
  "queued",
  "in_production",
  "ready_to_ship",
  "completed",
  "cancelled",
];

const ACTIVE_BATCH_STATUSES = new Set([
  "queued",
  "in_production",
  "ready_to_ship",
  "completed",
]);

const TRANSITIONS = {
  queued: new Set(["in_production", "cancelled"]),
  in_production: new Set(["ready_to_ship", "cancelled"]),
  ready_to_ship: new Set(["in_production", "completed", "cancelled"]),
  completed: new Set(),
  cancelled: new Set(),
};

function truthy(value) {
  return value === true || String(value).toLowerCase() === "true";
}

export function parseBatchLines(batch) {
  if (Array.isArray(batch?.line_items)) return batch.line_items;
  try {
    const parsed = JSON.parse(batch?.line_items || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lineKey(orderId, lineItemId) {
  return `${orderId || ""}::${lineItemId || ""}`;
}

function claimedUnitsByLine(batches = []) {
  const claimed = new Map();
  for (const batch of batches) {
    if (!ACTIVE_BATCH_STATUSES.has(String(batch.status).toLowerCase()))
      continue;
    for (const line of parseBatchLines(batch)) {
      const key = lineKey(line.orderId, line.lineItemId);
      claimed.set(key, (claimed.get(key) || 0) + Number(line.quantity || 0));
    }
  }
  return claimed;
}

export function buildProductionQueues(reconciliations = [], batches = []) {
  const claimed = claimedUnitsByLine(batches);

  return reconciliations.map((reconciliation) => {
    const campaign = reconciliation.campaign;
    const lines = [];
    for (const order of reconciliation.orders || []) {
      for (const line of order.lines || []) {
        const currentUnits = Number(line.currentUnits || 0);
        const unfulfilledUnits = Number(line.unfulfilledUnits);
        if (currentUnits <= 0 || !Number.isFinite(unfulfilledUnits)) continue;

        const outstanding = Math.min(
          currentUnits,
          Math.max(0, unfulfilledUnits),
        );
        const key = lineKey(order.id, line.lineItemId);
        const availableUnits = Math.max(
          0,
          outstanding - (claimed.get(key) || 0),
        );
        if (!availableUnits) continue;

        lines.push({
          orderId: order.id,
          orderName: order.name,
          orderCreatedAt: order.createdAt,
          lineItemId: line.lineItemId,
          productId: line.productId,
          variantId: line.variantId,
          itemName: line.itemName,
          sku: line.sku,
          variantTitle: line.variantTitle,
          customization: line.customization,
          quantity: availableUnits,
          proofId: line.proofId,
          proofVersion: line.proofVersion,
          proofContentHash: line.proofContentHash,
        });
      }
    }

    const campaignStatus = String(campaign.status || "").toLowerCase();
    const blocked =
      truthy(campaign.production_after_close) &&
      !["closed", "archived"].includes(campaignStatus);

    return {
      campaign,
      lines,
      orderCount: new Set(lines.map(({ orderId }) => orderId)).size,
      outstandingUnits: lines.reduce(
        (total, line) => total + Number(line.quantity || 0),
        0,
      ),
      blocked,
      blockReason: blocked
        ? "Production is configured to begin only after the campaign closes."
        : "",
    };
  });
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime()))
    throw new Error("A valid timestamp is required.");
  return date.toISOString();
}

export function createProductionBatchValues(
  queue,
  notes = "",
  now = new Date(),
) {
  if (!queue?.campaign?.id) throw new Error("Choose a valid campaign.");
  if (queue.blocked) throw new Error(queue.blockReason);
  if (!queue.lines?.length || queue.outstandingUnits <= 0) {
    throw new Error("This campaign has no unbatched, unfulfilled units.");
  }

  const createdAt = isoDate(now);
  const compactTimestamp = createdAt.replace(/[-:.TZ]/g, "").slice(0, 14);
  const campaignCode = String(
    queue.campaign.campaign_id || queue.campaign.handle || "CAMPAIGN",
  );
  const batchId = `${campaignCode}-BATCH-${compactTimestamp}`;

  return {
    batch_name: `${queue.campaign.campaign_name || campaignCode} — ${compactTimestamp}`,
    batch_id: batchId,
    campaign_id: queue.campaign.id,
    campaign_name: queue.campaign.campaign_name || campaignCode,
    fulfillment_mode: queue.campaign.fulfillment_mode || "individual_shipping",
    status: "queued",
    order_count: queue.orderCount,
    unit_count: queue.outstandingUnits,
    outstanding_units: queue.outstandingUnits,
    line_items: queue.lines,
    created_at: createdAt,
    internal_notes: String(notes || "").trim(),
  };
}

const PERSISTED_FIELDS = [
  "batch_name",
  "batch_id",
  "campaign_id",
  "campaign_name",
  "fulfillment_mode",
  "status",
  "order_count",
  "unit_count",
  "outstanding_units",
  "line_items",
  "created_at",
  "started_at",
  "completed_at",
  "internal_notes",
];

export function updateProductionBatchValues(
  batch,
  nextStatus,
  notes,
  now = new Date(),
) {
  const currentStatus = String(batch?.status || "").toLowerCase();
  const normalizedNext = String(nextStatus || "").toLowerCase();
  if (!PRODUCTION_BATCH_STATUSES.includes(normalizedNext)) {
    throw new Error("Choose a valid production batch status.");
  }
  if (!TRANSITIONS[currentStatus]?.has(normalizedNext)) {
    throw new Error(
      `Production batch cannot move from ${currentStatus || "unknown"} to ${normalizedNext}.`,
    );
  }

  const values = Object.fromEntries(
    PERSISTED_FIELDS.flatMap((key) =>
      batch?.[key] === undefined || batch?.[key] === null
        ? []
        : [[key, batch[key]]],
    ),
  );
  values.status = normalizedNext;
  if (notes !== undefined) values.internal_notes = String(notes).trim();
  if (normalizedNext === "in_production" && !values.started_at) {
    values.started_at = isoDate(now);
  }
  if (normalizedNext === "completed") values.completed_at = isoDate(now);
  return values;
}
