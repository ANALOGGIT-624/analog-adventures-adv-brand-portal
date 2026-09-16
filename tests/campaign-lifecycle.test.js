import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignLifecycleValues,
  campaignDateTime,
} from "../app/lib/campaign-lifecycle.server.js";

const campaign = {
  id: "gid://shopify/Metaobject/100",
  handle: "pilot-fall-2026",
  campaign_name: "Pilot Fall 2026",
  campaign_id: "PILOT-FALL-2026",
  organization_store: "gid://shopify/Metaobject/200",
  status: "live",
  products: '["gid://shopify/Product/300"]',
  pricing_mode: "retail",
  payout_rule: "gid://shopify/Metaobject/400",
  fulfillment_mode: "bulk_to_organizer",
  production_after_close: "true",
  starts_at: "2026-08-01T00:00:00Z",
  closes_at: "2026-09-01T23:59:59Z",
};

test("lifecycle updates preserve campaign configuration", () => {
  const values = buildCampaignLifecycleValues(campaign, {
    status: "closed",
    startsAt: "",
    closesAt: "2026-09-15",
    now: new Date("2026-09-16T12:00:00Z"),
  });

  assert.equal(values.status, "closed");
  assert.equal(values.closes_at, "2026-09-15T23:59:59Z");
  assert.equal(values.products, campaign.products);
  assert.equal(values.payout_rule, campaign.payout_rule);
  assert.equal(values.fulfillment_mode, campaign.fulfillment_mode);
});

test("closed campaigns cannot retain a future close date", () => {
  assert.throws(
    () =>
      buildCampaignLifecycleValues(campaign, {
        status: "closed",
        startsAt: "",
        closesAt: "2026-09-30",
        now: new Date("2026-09-16T12:00:00Z"),
      }),
    /cannot close in the future/,
  );
});

test("close date must follow start date", () => {
  assert.throws(
    () =>
      buildCampaignLifecycleValues(campaign, {
        status: "scheduled",
        startsAt: "2026-10-10",
        closesAt: "2026-10-01",
      }),
    /after its start date/,
  );
});

test("campaign date values use consistent UTC boundaries", () => {
  assert.equal(campaignDateTime("2026-09-16"), "2026-09-16T00:00:00Z");
  assert.equal(
    campaignDateTime("2026-09-16", true),
    "2026-09-16T23:59:59Z",
  );
});
