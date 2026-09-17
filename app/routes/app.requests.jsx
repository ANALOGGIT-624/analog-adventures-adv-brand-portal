import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  PORTAL_TYPES,
  getPortalSnapshot,
  upsertMetaobject,
} from "../lib/brand-portal.server";
import { updateOrganizationRequestValues } from "../lib/organization-request.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return getPortalSnapshot(admin);
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  try {
    const snapshot = await getPortalSnapshot(admin);
    const recordId = String(formData.get("request_record_id") || "");
    const record = snapshot.organizationRequests.find(
      ({ id }) => id === recordId,
    );
    if (!record)
      throw new Error("The selected organization request was not found.");
    const values = updateOrganizationRequestValues(
      record,
      formData.get("status"),
      formData.get("staff_notes"),
    );
    await upsertMetaobject(admin, {
      type: PORTAL_TYPES.organizationRequest,
      handle: record.handle,
      values,
    });
    return {
      ok: true,
      message: `${record.request_name} moved to ${values.status.replaceAll("_", " ")}`,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

function label(value) {
  return String(value || "").replaceAll("_", " ");
}

function detailsFor(record) {
  try {
    return JSON.parse(record.requested_details || "{}");
  } catch {
    return {};
  }
}

function nextStatuses(status) {
  switch (String(status).toLowerCase()) {
    case "submitted":
      return ["in_review", "approved", "declined"];
    case "in_review":
      return ["approved", "declined"];
    case "approved":
      return ["completed", "in_review"];
    case "declined":
      return ["in_review"];
    default:
      return [];
  }
}

export default function Requests() {
  const { organizationRequests, organizations, campaigns } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  return (
    <s-page
      heading="Organization requests"
      subheading="Review organizer proposals before changing stores, products, branding, or campaign settings."
    >
      {fetcher.data?.error && (
        <s-banner heading="Request was not updated" tone="critical">
          {fetcher.data.error}
        </s-banner>
      )}
      <s-section heading="Request queue">
        {organizationRequests.length === 0 ? (
          <s-banner heading="No organization requests" tone="info">
            Requests submitted through customer accounts will appear here.
          </s-banner>
        ) : (
          <s-stack direction="block" gap="base">
            {[...organizationRequests]
              .sort((a, b) =>
                String(b.requested_at).localeCompare(String(a.requested_at)),
              )
              .map((record) => {
                const details = detailsFor(record);
                const organization = organizations.find(
                  ({ id }) => id === record.organization_store_id,
                );
                const campaign = campaigns.find(
                  ({ id }) => id === record.campaign_id,
                );
                const transitions = nextStatuses(record.status);
                return (
                  <s-box
                    key={record.id}
                    padding="base"
                    border="base"
                    borderRadius="base"
                  >
                    <s-stack direction="block" gap="base">
                      <s-grid gridTemplateColumns="2fr 1fr 1fr" gap="base">
                        <s-stack direction="block" gap="small-200">
                          <s-text type="strong">{record.request_name}</s-text>
                          <s-text color="subdued">{record.request_id}</s-text>
                        </s-stack>
                        <s-text>{label(record.request_type)}</s-text>
                        <s-text>{label(record.status)}</s-text>
                      </s-grid>
                      <s-text>
                        {organization?.store_name || "New organization store"}
                        {campaign ? ` · ${campaign.campaign_name}` : ""}
                      </s-text>
                      <s-paragraph>{details.details}</s-paragraph>
                      {(details.requestedStartDate ||
                        details.requestedCloseDate) && (
                        <s-text color="subdued">
                          Requested dates:{" "}
                          {details.requestedStartDate || "open"} –{" "}
                          {details.requestedCloseDate || "open"}
                        </s-text>
                      )}
                      {record.staff_notes && (
                        <s-text color="subdued">
                          Staff note: {record.staff_notes}
                        </s-text>
                      )}
                      {transitions.length ? (
                        <fetcher.Form method="post">
                          <input
                            type="hidden"
                            name="request_record_id"
                            value={record.id}
                          />
                          <s-grid gridTemplateColumns="1fr 2fr auto" gap="base">
                            <s-select
                              key={`${record.id}-${record.status}`}
                              label="Next status"
                              name="status"
                              required
                            >
                              <s-option value="">Choose status</s-option>
                              {transitions.map((status) => (
                                <s-option key={status} value={status}>
                                  {label(status)}
                                </s-option>
                              ))}
                            </s-select>
                            <s-text-field
                              label="Staff notes"
                              name="staff_notes"
                              value={record.staff_notes || ""}
                            />
                            <s-button type="submit" loading={busy}>
                              Update
                            </s-button>
                          </s-grid>
                        </fetcher.Form>
                      ) : (
                        <s-text color="subdued">
                          This completed request is locked.
                        </s-text>
                      )}
                    </s-stack>
                  </s-box>
                );
              })}
          </s-stack>
        )}
      </s-section>
      <s-section heading="Approval boundary">
        <s-paragraph>
          Approval records staff intent only. Staff must still create or update
          the Shopify campaign, products, pricing, payout terms, artwork, and
          publication settings through their controlled workflows.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
