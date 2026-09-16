import { slugify } from "./brand-portal.server.js";
import {
  CAMPAIGN_RELAUNCH_STATUSES,
  CAMPAIGN_STATUSES,
} from "./campaign-lifecycle.js";

const CAMPAIGN_VALUE_KEYS = [
  "campaign_name",
  "campaign_id",
  "organization_store",
  "status",
  "products",
  "pricing_mode",
  "payout_rule",
  "fulfillment_mode",
  "production_after_close",
  "internal_notes",
  "fundraising_goal",
  "starts_at",
  "closes_at",
];

export function campaignDateTime(value, endOfDay = false) {
  if (!value) return null;
  return value + (endOfDay ? "T23:59:59Z" : "T00:00:00Z");
}

export function buildCampaignLifecycleValues(
  campaign,
  { status, startsAt, closesAt, isPaid = false, now = new Date() },
) {
  if (!campaign?.id || !campaign?.handle) {
    throw new Error("Choose an existing campaign to update.");
  }
  if (!CAMPAIGN_STATUSES.includes(status)) {
    throw new Error("Choose a valid campaign status.");
  }
  if (isPaid && status !== "archived") {
    throw new Error(
      "A campaign with a paid statement can only remain archived. Relaunch it as a new campaign instead.",
    );
  }

  const values = Object.fromEntries(
    CAMPAIGN_VALUE_KEYS.flatMap((key) =>
      campaign[key] === undefined || campaign[key] === null
        ? []
        : [[key, campaign[key]]],
    ),
  );
  const nextStartsAt = campaignDateTime(startsAt) || campaign.starts_at || null;
  const nextClosesAt =
    campaignDateTime(closesAt, true) || campaign.closes_at || null;

  if (nextStartsAt && nextClosesAt) {
    if (new Date(nextClosesAt).getTime() <= new Date(nextStartsAt).getTime()) {
      throw new Error("The campaign close date must be after its start date.");
    }
  }
  if (["closed", "archived"].includes(status)) {
    if (!nextClosesAt) {
      throw new Error("Set a close date before closing or archiving a campaign.");
    }
    if (new Date(nextClosesAt).getTime() > now.getTime()) {
      throw new Error("A closed or archived campaign cannot close in the future.");
    }
  }

  values.status = status;
  if (nextStartsAt) values.starts_at = nextStartsAt;
  if (nextClosesAt) values.closes_at = nextClosesAt;
  return values;
}

export function buildCampaignRelaunch(
  campaign,
  {
    campaignName,
    campaignId,
    status,
    startsAt,
    closesAt,
    existingCampaigns = [],
  },
) {
  if (!campaign?.id || !campaign?.handle) {
    throw new Error("Choose a closed or archived campaign to relaunch.");
  }
  if (!["closed", "archived"].includes(String(campaign.status))) {
    throw new Error("Only closed or archived campaigns can be relaunched.");
  }

  const name = String(campaignName || "").trim();
  const id = String(campaignId || "").trim();
  if (!name || !id || !startsAt || !closesAt) {
    throw new Error(
      "Campaign name, new campaign ID, start date, and close date are required.",
    );
  }
  if (!CAMPAIGN_RELAUNCH_STATUSES.includes(status)) {
    throw new Error("Choose a valid relaunch status.");
  }

  const handle = slugify(id);
  if (
    existingCampaigns.some(
      (existing) =>
        String(existing.campaign_id || "").toLowerCase() === id.toLowerCase() ||
        existing.handle === handle,
    )
  ) {
    throw new Error("Use a new campaign ID for every relaunch.");
  }

  const nextStartsAt = campaignDateTime(startsAt);
  const nextClosesAt = campaignDateTime(closesAt, true);
  if (new Date(nextClosesAt).getTime() <= new Date(nextStartsAt).getTime()) {
    throw new Error("The campaign close date must be after its start date.");
  }

  const values = Object.fromEntries(
    CAMPAIGN_VALUE_KEYS.flatMap((key) =>
      campaign[key] === undefined || campaign[key] === null
        ? []
        : [[key, campaign[key]]],
    ),
  );
  return {
    handle,
    values: {
      ...values,
      campaign_name: name,
      campaign_id: id,
      status,
      starts_at: nextStartsAt,
      closes_at: nextClosesAt,
    },
  };
}
