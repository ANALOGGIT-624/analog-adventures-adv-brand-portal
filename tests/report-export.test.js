import test from "node:test";
import assert from "node:assert/strict";
import {
  csvDocument,
  payoutReport,
  productionReport,
  salesReport,
} from "../app/lib/report-export.server.js";

const reconciliation = {
  campaign: {
    campaign_id: "PILOT-2026",
    campaign_name: "Pilot, Fall 2026",
    fulfillment_mode: "bulk_to_organizer",
    production_after_close: "true",
  },
  orderCount: 1,
  eligibleUnits: 1,
  grossRevenueCents: 2500,
  refundsCents: 500,
  proceedsCents: 500,
  currency: "USD",
  orders: [
    {
      name: "#1001",
      createdAt: "2026-09-16T12:00:00Z",
      units: 2,
      refundedUnits: 1,
      eligibleUnits: 1,
      grossRevenueCents: 2500,
      refundsCents: 500,
      proceedsCents: 500,
      lines: [
        {
          itemName: "Name Tag",
          variantTitle: "Blue",
          sku: "TAG-BLUE",
          customization: 'Name: Ada "AJ"',
          orderedUnits: 2,
          currentUnits: 1,
          unfulfilledUnits: 1,
          fulfillmentState: "partially_fulfilled",
          proofVersion: 2,
          proofId: "gid://shopify/Metaobject/9",
          proofContentHash: "abc123",
        },
      ],
    },
  ],
};

test("sales report contains reconciled order totals", () => {
  const report = salesReport(reconciliation);
  assert.equal(report.rows[0].order, "#1001");
  assert.equal(report.rows[0].grossRevenue, "25.00");
  assert.equal(report.rows[0].calculatedProceeds, "5.00");
});

test("production report retains fulfillment, personalization, and proof", () => {
  const report = productionReport(reconciliation);
  assert.equal(report.rows[0].outstandingUnits, 1);
  assert.equal(report.rows[0].personalization, 'Name: Ada "AJ"');
  assert.equal(report.rows[0].proofVersion, 2);
  assert.equal(report.rows[0].productionAfterClose, "Yes");
});

test("payout report compares reconciliation to saved statement", () => {
  const report = payoutReport(reconciliation, {
    statement_id: "PAYOUT-PILOT-2026",
    status: "paid",
    deductions: "2.00",
    organization_proceeds: "3.00",
    currency: "USD",
    paid_at: "2026-09-16T15:00:00Z",
  });
  assert.equal(report.rows[0].reconciledProceeds, "5.00");
  assert.equal(report.rows[0].savedOrganizationProceeds, "3.00");
});

test("CSV output safely quotes commas and double quotes", () => {
  const report = productionReport(reconciliation);
  const csv = csvDocument(report.columns, report.rows);
  assert.match(csv, /"Pilot, Fall 2026"/);
  assert.match(csv, /"Name: Ada ""AJ"""/);
  assert.ok(csv.endsWith("\r\n"));
});
