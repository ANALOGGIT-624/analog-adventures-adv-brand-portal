export const ORGANIZATION_REQUEST_TYPES = [
  "new_store",
  "new_campaign",
  "product_change",
  "branding_change",
  "campaign_relaunch",
];

export const ORGANIZATION_REQUEST_STATUSES = [
  "submitted",
  "in_review",
  "approved",
  "declined",
  "completed",
];

const STATUS_TRANSITIONS = {
  submitted: new Set(["in_review", "approved", "declined"]),
  in_review: new Set(["approved", "declined"]),
  approved: new Set(["completed", "in_review"]),
  declined: new Set(["in_review"]),
  completed: new Set(),
};

function text(value, limit = 2000) {
  return String(value || "")
    .trim()
    .slice(0, limit);
}

export function createOrganizationRequestValues(
  input,
  context,
  now = new Date(),
) {
  const requestType = text(input.requestType, 50).toLowerCase();
  if (!ORGANIZATION_REQUEST_TYPES.includes(requestType)) {
    throw new Error("Choose a valid request type.");
  }
  if (!context?.customerId || !context?.companyId) {
    throw new Error(
      "A Shopify company contact is required to submit a request.",
    );
  }
  const title = text(input.title, 120);
  const details = text(input.details, 4000);
  if (!title || !details)
    throw new Error("Request title and details are required.");
  const requestedStartDate = text(input.requestedStartDate, 10);
  const requestedCloseDate = text(input.requestedCloseDate, 10);
  for (const date of [requestedStartDate, requestedCloseDate].filter(Boolean)) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      throw new Error("Requested dates must be valid calendar dates.");
    }
  }
  if (
    requestedStartDate &&
    requestedCloseDate &&
    requestedCloseDate < requestedStartDate
  ) {
    throw new Error("Requested close date must be on or after the start date.");
  }

  const timestamp = new Date(now);
  if (Number.isNaN(timestamp.getTime()))
    throw new Error("A valid request time is required.");
  const requestedAt = timestamp.toISOString();
  const compact = requestedAt.replace(/[-:.TZ]/g, "").slice(0, 17);
  const requestId = `ORG-REQ-${compact}`;

  return {
    request_name: title,
    request_id: requestId,
    request_type: requestType,
    status: "submitted",
    company_id: context.companyId,
    organization_store_id: context.organizationId || undefined,
    campaign_id: context.campaignId || undefined,
    requested_by_customer_id: context.customerId,
    requested_at: requestedAt,
    requested_details: {
      title,
      details,
      requestedStartDate,
      requestedCloseDate,
    },
    artwork_file: context.artwork?.fileId,
    artwork_filename: context.artwork?.filename,
    artwork_mime_type: context.artwork?.mimeType,
    artwork_content_hash: context.artwork?.hash,
    artwork_uploaded_at: context.artwork?.uploadedAt,
  };
}

export function updateOrganizationRequestValues(
  request,
  nextStatus,
  staffNotes,
  now = new Date(),
) {
  const current = text(request?.status, 50).toLowerCase();
  const next = text(nextStatus, 50).toLowerCase();
  if (!ORGANIZATION_REQUEST_STATUSES.includes(next)) {
    throw new Error("Choose a valid request status.");
  }
  if (!STATUS_TRANSITIONS[current]?.has(next)) {
    throw new Error(
      `Request cannot move from ${current || "unknown"} to ${next}.`,
    );
  }
  const reviewedAt = new Date(now);
  if (Number.isNaN(reviewedAt.getTime()))
    throw new Error("A valid review time is required.");

  const keys = [
    "request_name",
    "request_id",
    "request_type",
    "company_id",
    "organization_store_id",
    "campaign_id",
    "requested_by_customer_id",
    "requested_at",
    "requested_details",
    "artwork_file",
    "artwork_filename",
    "artwork_mime_type",
    "artwork_content_hash",
    "artwork_uploaded_at",
  ];
  return {
    ...Object.fromEntries(
      keys.flatMap((key) =>
        request?.[key] == null ? [] : [[key, request[key]]],
      ),
    ),
    status: next,
    staff_notes: text(staffNotes, 4000),
    reviewed_at: reviewedAt.toISOString(),
  };
}
