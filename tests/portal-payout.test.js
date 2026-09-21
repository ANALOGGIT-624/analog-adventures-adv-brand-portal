import assert from "node:assert/strict";
import test from "node:test";
import { publicPayoutStatement } from "../app/lib/portal-payout.js";

test("customer payout detail includes reconciliation and settlement timing", () => {
  const result = publicPayoutStatement(
    {
      id: "gid://shopify/Metaobject/1",
      statement_id: "PAYOUT-ttps-fall-e2e",
      campaign: "gid://shopify/Metaobject/2",
      status: "draft",
      period_start: "2026-09-15",
      period_end: "2026-09-16",
      gross_revenue: "2270.80",
      refunds: "785.95",
      deductions: "0",
      organization_proceeds: "15",
      currency: "USD",
    },
    {
      campaign_name: "Tot Time Fall 2026 E2E Test",
      closes_at: "2026-09-16T18:30:00.000Z",
    },
    { settlement_delay_days: "14" },
  );

  assert.equal(result.campaignName, "Tot Time Fall 2026 E2E Test");
  assert.equal(result.grossRevenue, 2270.8);
  assert.equal(result.refunds, 785.95);
  assert.equal(result.organizationProceeds, 15);
  assert.equal(result.settlementEligibleAt, "2026-09-30T18:30:00.000Z");
});

test("customer payout detail handles campaigns without a close date", () => {
  const result = publicPayoutStatement(
    {
      id: "gid://shopify/Metaobject/1",
      statement_id: "PAYOUT-DRAFT",
      campaign: "gid://shopify/Metaobject/2",
      status: "draft",
    },
    { campaign_name: "Draft campaign" },
    { settlement_delay_days: "14" },
  );

  assert.equal(result.settlementEligibleAt, null);
  assert.equal(result.currency, "USD");
});
