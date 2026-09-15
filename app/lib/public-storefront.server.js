export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

export function referenceIds(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [value];
  }
}

export function isCampaignLive(campaign, now = new Date()) {
  if (String(campaign.status).toLowerCase() !== "live") return false;
  const startsAt = campaign.starts_at ? new Date(campaign.starts_at) : null;
  const closesAt = campaign.closes_at ? new Date(campaign.closes_at) : null;
  return (!startsAt || startsAt <= now) && (!closesAt || closesAt >= now);
}
