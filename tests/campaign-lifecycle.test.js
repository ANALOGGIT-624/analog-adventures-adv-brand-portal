import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignRelaunch,
  buildCampaignLifecycleValues,
  buildCampaignSettingsValues,
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

test("closing a campaign today records the actual close time", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const values = buildCampaignLifecycleValues(campaign, {
    status: "closed",
    startsAt: "",
    closesAt: "2026-09-16",
    now,
  });

  assert.equal(values.closes_at, now.toISOString());
});

test("campaigns with paid statements cannot be reopened", () => {
  assert.throws(
    () =>
      buildCampaignLifecycleValues(campaign, {
        status: "live",
        startsAt: "",
        closesAt: "",
        isPaid: true,
      }),
    /Relaunch it as a new campaign/,
  );
});

test("archiving remains available after a campaign is paid", () => {
  const values = buildCampaignLifecycleValues(campaign, {
    status: "archived",
    startsAt: "",
    closesAt: "",
    isPaid: true,
    now: new Date("2026-09-16T12:00:00Z"),
  });

  assert.equal(values.status, "archived");
});

test("relaunch creates a new identity while preserving configuration", () => {
  const relaunch = buildCampaignRelaunch(
    { ...campaign, status: "archived" },
    {
      campaignName: "Pilot Spring 2027",
      campaignId: "PILOT-SPRING-2027",
      status: "scheduled",
      startsAt: "2027-03-01",
      closesAt: "2027-03-31",
      existingCampaigns: [campaign],
    },
  );

  assert.equal(relaunch.handle, "pilot-spring-2027");
  assert.equal(relaunch.values.campaign_id, "PILOT-SPRING-2027");
  assert.equal(relaunch.values.status, "scheduled");
  assert.equal(relaunch.values.products, campaign.products);
  assert.equal(relaunch.values.payout_rule, campaign.payout_rule);
  assert.equal(relaunch.values.starts_at, "2027-03-01T00:00:00Z");
  assert.equal(relaunch.values.closes_at, "2027-03-31T23:59:59Z");
});

test("relaunch rejects an existing campaign identity", () => {
  assert.throws(
    () =>
      buildCampaignRelaunch(
        { ...campaign, status: "archived" },
        {
          campaignName: "Duplicate",
          campaignId: campaign.campaign_id,
          status: "draft",
          startsAt: "2027-03-01",
          closesAt: "2027-03-31",
          existingCampaigns: [campaign],
        },
      ),
    /new campaign ID/,
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
  assert.equal(campaignDateTime("2026-09-16", true), "2026-09-16T23:59:59Z");
});

test("pre-launch fulfillment and production settings can be updated", () => {
  const values = buildCampaignSettingsValues(
    { ...campaign, status: "scheduled" },
    {
      fulfillmentMode: "local_pickup",
      productionAfterClose: "false",
    },
  );

  assert.equal(values.fulfillment_mode, "local_pickup");
  assert.equal(values.production_after_close, false);
  assert.equal(values.products, campaign.products);
  assert.equal(values.payout_rule, campaign.payout_rule);
});

test("fulfillment settings lock when a campaign is live", () => {
  assert.throws(
    () =>
      buildCampaignSettingsValues(campaign, {
        fulfillmentMode: "bulk_to_organizer",
        productionAfterClose: true,
      }),
    /before a campaign goes live/i,
  );
});

test("pre-launch settings require an explicit production choice", () => {
  assert.throws(
    () =>
      buildCampaignSettingsValues(
        { ...campaign, status: "draft" },
        {
          fulfillmentMode: "bulk_to_organizer",
          productionAfterClose: "",
        },
      ),
    /when production should begin/i,
  );
});
