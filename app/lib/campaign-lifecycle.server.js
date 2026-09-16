import { CAMPAIGN_STATUSES } from "./campaign-lifecycle.js";

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
  { status, startsAt, closesAt, now = new Date() },
) {
  if (!campaign?.id || !campaign?.handle) {
    throw new Error("Choose an existing campaign to update.");
  }
  if (!CAMPAIGN_STATUSES.includes(status)) {
    throw new Error("Choose a valid campaign status.");
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
