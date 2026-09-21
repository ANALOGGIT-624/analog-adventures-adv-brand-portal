import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductionQueues,
  createProductionBatchValues,
  parseBatchLines,
  productionBatchLineDetails,
  updateProductionBatchValues,
} from "../app/lib/production-batches.server.js";

function reconciliation(overrides = {}) {
  const { campaign: campaignOverrides, ...rest } = overrides;
  return {
    campaign: {
      id: "gid://shopify/Metaobject/1",
      handle: "tot-time-fall",
      campaign_id: "TOT-FALL-2026",
      campaign_name: "Tot Time Fall Store",
      status: "closed",
      fulfillment_mode: "bulk_delivery",
      production_after_close: "true",
      ...campaignOverrides,
    },
    orders: [
      {
        id: "gid://shopify/Order/100",
        name: "#1001",
        createdAt: "2026-09-15T12:00:00.000Z",
        lines: [
          {
            lineItemId: "gid://shopify/LineItem/10",
            productId: "gid://shopify/Product/20",
            variantId: "gid://shopify/ProductVariant/30",
            itemName: "Preschool tag",
            sku: "TAG-BLUE",
            variantTitle: "Blue",
            customization: "Name: Ada",
            currentUnits: 2,
            unfulfilledUnits: 2,
            proofId: "PROOF-TOT-2",
            proofVersion: 2,
            proofContentHash: "abc123",
          },
          {
            lineItemId: "gid://shopify/LineItem/11",
            itemName: "Fulfilled item",
            currentUnits: 1,
            unfulfilledUnits: 0,
          },
          {
            lineItemId: "gid://shopify/LineItem/12",
            itemName: "Refunded item",
            currentUnits: 0,
            unfulfilledUnits: 0,
          },
        ],
      },
    ],
    ...rest,
  };
}

test("production queues include only current unfulfilled units", () => {
  const [queue] = buildProductionQueues([reconciliation()]);
  assert.equal(queue.orderCount, 1);
  assert.equal(queue.outstandingUnits, 2);
  assert.equal(queue.lines.length, 1);
  assert.equal(queue.lines[0].itemName, "Preschool tag");
});

test("production-after-close campaigns remain blocked while live", () => {
  const [queue] = buildProductionQueues([
    reconciliation({ campaign: { status: "live" } }),
  ]);
  assert.equal(queue.blocked, true);
  assert.match(queue.blockReason, /after the campaign closes/i);
  assert.throws(
    () => createProductionBatchValues(queue),
    /after the campaign closes/i,
  );
});

test("existing non-cancelled batches reserve units against duplicate batching", () => {
  const existing = {
    status: "in_production",
    line_items: JSON.stringify([
      {
        orderId: "gid://shopify/Order/100",
        lineItemId: "gid://shopify/LineItem/10",
        quantity: 1,
      },
    ]),
  };
  const [queue] = buildProductionQueues([reconciliation()], [existing]);
  assert.equal(queue.outstandingUnits, 1);
  assert.equal(queue.lines[0].quantity, 1);

  existing.status = "cancelled";
  const [releasedQueue] = buildProductionQueues([reconciliation()], [existing]);
  assert.equal(releasedQueue.outstandingUnits, 2);
});

test("batch creation snapshots production and approved proof details", () => {
  const [queue] = buildProductionQueues([reconciliation()]);
  const values = createProductionBatchValues(
    queue,
    "Use blue blanks",
    "2026-09-17T14:30:00.000Z",
  );
  assert.equal(values.batch_id, "TOT-FALL-2026-BATCH-20260917143000");
  assert.equal(values.status, "queued");
  assert.equal(values.order_count, 1);
  assert.equal(values.unit_count, 2);
  assert.equal(values.line_items[0].customization, "Name: Ada");
  assert.equal(values.line_items[0].proofVersion, 2);
  assert.equal(values.internal_notes, "Use blue blanks");
});

test("batch line details resolve the immutable proof file", () => {
  const details = productionBatchLineDetails(
    {
      line_items: JSON.stringify([
        {
          orderId: "gid://shopify/Order/100",
          itemName: "Preschool tag",
          proofId: "gid://shopify/Metaobject/9",
          proofVersion: 2,
        },
      ]),
    },
    [
      {
        id: "gid://shopify/Metaobject/9",
        proof_name: "Tot Time proof — Version 2",
        asset_file_url: "https://cdn.shopify.com/proof-v2.pdf",
      },
    ],
  );

  assert.equal(details[0].proofName, "Tot Time proof — Version 2");
  assert.equal(details[0].proofUrl, "https://cdn.shopify.com/proof-v2.pdf");
});

test("status transitions set timestamps and preserve the snapshot", () => {
  const [queue] = buildProductionQueues([reconciliation()]);
  const created = createProductionBatchValues(
    queue,
    "",
    "2026-09-17T14:30:00.000Z",
  );
  const started = updateProductionBatchValues(
    created,
    "in_production",
    "Laser first",
    "2026-09-17T15:00:00.000Z",
  );
  assert.equal(started.started_at, "2026-09-17T15:00:00.000Z");
  assert.equal(parseBatchLines(started).length, 1);

  const ready = updateProductionBatchValues(started, "ready_to_ship", "Packed");
  const completed = updateProductionBatchValues(
    ready,
    "completed",
    "Delivered",
    "2026-09-18T10:00:00.000Z",
  );
  assert.equal(completed.completed_at, "2026-09-18T10:00:00.000Z");
  assert.equal(completed.internal_notes, "Delivered");
});

test("invalid and terminal status transitions are rejected", () => {
  assert.throws(
    () => updateProductionBatchValues({ status: "queued" }, "completed"),
    /cannot move/i,
  );
  assert.throws(
    () => updateProductionBatchValues({ status: "completed" }, "cancelled"),
    /cannot move/i,
  );
  assert.throws(
    () => updateProductionBatchValues({ status: "queued" }, "mystery"),
    /valid production batch status/i,
  );
});
