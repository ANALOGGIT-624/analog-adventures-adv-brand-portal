import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  PORTAL_TYPES,
  normalizeMetaobject,
  slugify,
  upsertMetaobject,
} from "../lib/brand-portal.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query CampaignIndex(
        $organizationType: String!
        $campaignType: String!
        $payoutRuleType: String!
      ) {
        organizations: metaobjects(type: $organizationType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        campaigns: metaobjects(type: $campaignType, first: 100) {
          nodes { id handle displayName updatedAt fields { key value } }
        }
        payoutRules: metaobjects(type: $payoutRuleType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        products(first: 50, query: "status:active") {
          nodes { id title status }
        }
      }
    `,
    {
      variables: {
        organizationType: PORTAL_TYPES.organizationStore,
        campaignType: PORTAL_TYPES.campaign,
        payoutRuleType: PORTAL_TYPES.payoutRule,
      },
    },
  );
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join("; "));
  }

  return {
    organizations: payload.data.organizations.nodes.map(normalizeMetaobject),
    campaigns: payload.data.campaigns.nodes.map(normalizeMetaobject),
    payoutRules: payload.data.payoutRules.nodes.map(normalizeMetaobject),
    products: payload.data.products.nodes,
  };
};

function dateTimeValue(value, endOfDay = false) {
  if (!value) return null;
  return value + (endOfDay ? "T23:59:59Z" : "T00:00:00Z");
}

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const campaignName = String(formData.get("campaign_name") || "").trim();
  const organizationStore = String(
    formData.get("organization_store") || "",
  ).trim();
  const payoutRule = String(formData.get("payout_rule") || "").trim();
  const products = formData.getAll("products").map(String);

  if (!campaignName || !organizationStore || !payoutRule || products.length === 0) {
    return {
      ok: false,
      error:
        "Campaign name, organization store, payout rule, and at least one product are required.",
    };
  }

  const campaignId =
    String(formData.get("campaign_id") || "").trim() ||
    "CAMPAIGN-" + Date.now();
  const startsAt = dateTimeValue(String(formData.get("starts_at") || ""));
  const closesAt = dateTimeValue(
    String(formData.get("closes_at") || ""),
    true,
  );

  const values = {
    campaign_name: campaignName,
    campaign_id: campaignId,
    organization_store: organizationStore,
    status: String(formData.get("status") || "draft"),
    products,
    pricing_mode: String(formData.get("pricing_mode") || "retail"),
    payout_rule: payoutRule,
    fulfillment_mode: String(
      formData.get("fulfillment_mode") || "individual_shipping",
    ),
    production_after_close:
      formData.get("production_after_close") === "true",
    internal_notes: String(formData.get("internal_notes") || "").trim(),
  };
  const fundraisingGoal = String(
    formData.get("fundraising_goal") || "",
  ).trim();
  if (startsAt) values.starts_at = startsAt;
  if (closesAt) values.closes_at = closesAt;
  if (fundraisingGoal) values.fundraising_goal = fundraisingGoal;

  try {
    const campaign = await upsertMetaobject(admin, {
      type: PORTAL_TYPES.campaign,
      handle: slugify(campaignId),
      values,
    });
    return { ok: true, campaign };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

function statusTone(status) {
  if (String(status).toLowerCase() === "live") return "success";
  if (["closed", "archived"].includes(String(status).toLowerCase())) {
    return "critical";
  }
  return "info";
}

export default function Campaigns() {
  const { organizations, campaigns, payoutRules, products } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const canCreate =
    organizations.length > 0 && payoutRules.length > 0 && products.length > 0;

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show("Campaign saved");
  }, [fetcher.data, shopify]);

  return (
    <s-page
      heading="Campaigns"
      subheading="Schedule products, payout terms, and fulfillment for each organization store."
    >
      <s-section heading="Create campaign">
        {fetcher.data?.error && (
          <s-banner heading="Campaign was not saved" tone="critical">
            {fetcher.data.error}
          </s-banner>
        )}
        {!canCreate ? (
          <s-banner heading="Campaign prerequisites are missing" tone="warning">
            Add an organization store, an active payout rule, and at least one
            active product before creating a campaign.
          </s-banner>
        ) : (
          <fetcher.Form method="post">
            <s-stack direction="block" gap="base">
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-text-field
                  label="Campaign name"
                  name="campaign_name"
                  placeholder="Spring 2027 Fundraiser"
                  required
                />
                <s-text-field
                  label="Campaign ID"
                  name="campaign_id"
                  placeholder="PCC-SPRING-2027"
                />
              </s-grid>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-select
                  label="Organization store"
                  name="organization_store"
                  required
                >
                  <s-option value="">Select a store</s-option>
                  {organizations.map((organization) => (
                    <s-option key={organization.id} value={organization.id}>
                      {organization.store_name}
                    </s-option>
                  ))}
                </s-select>
                <s-select label="Payout rule" name="payout_rule" required>
                  <s-option value="">Select a payout rule</s-option>
                  {payoutRules.map((rule) => (
                    <s-option key={rule.id} value={rule.id}>
                      {rule.rule_name}
                    </s-option>
                  ))}
                </s-select>
              </s-grid>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-date-field label="Starts" name="starts_at" />
                <s-date-field label="Closes" name="closes_at" />
              </s-grid>
              <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-select label="Status" name="status">
                  <s-option value="draft">Draft</s-option>
                  <s-option value="proofing">Proofing</s-option>
                  <s-option value="scheduled">Scheduled</s-option>
                  <s-option value="live">Live</s-option>
                  <s-option value="closed">Closed</s-option>
                  <s-option value="archived">Archived</s-option>
                </s-select>
                <s-select label="Pricing mode" name="pricing_mode">
                  <s-option value="retail">Retail price</s-option>
                  <s-option value="organization_markup">
                    Organization markup
                  </s-option>
                  <s-option value="fixed_proceeds">Fixed proceeds</s-option>
                </s-select>
              </s-grid>
              <s-select label="Fulfillment" name="fulfillment_mode">
                <s-option value="individual_shipping">
                  Ship each customer order
                </s-option>
                <s-option value="bulk_to_organizer">
                  Bulk ship to organizer
                </s-option>
                <s-option value="local_pickup">Organization pickup</s-option>
              </s-select>
              <s-select
                label="Production timing"
                name="production_after_close"
              >
                <s-option value="true">Batch after campaign closes</s-option>
                <s-option value="false">Produce as orders arrive</s-option>
              </s-select>
              <s-money-field
                label="Fundraising goal"
                name="fundraising_goal"
                min={0}
              />
              <s-heading>Products</s-heading>
              <s-stack direction="block" gap="small-200">
                {products.map((product) => (
                  <s-checkbox
                    key={product.id}
                    label={product.title}
                    name="products"
                    value={product.id}
                  />
                ))}
              </s-stack>
              <s-text-area
                label="Internal notes"
                name="internal_notes"
                rows={3}
                maxLength={1000}
              />
              <s-button type="submit" variant="primary" loading={busy}>
                Save campaign
              </s-button>
            </s-stack>
          </fetcher.Form>
        )}
      </s-section>

      <s-section heading="Campaign history">
        {campaigns.length === 0 ? (
          <s-paragraph>No campaigns have been created.</s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Campaign</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Starts</s-table-header>
              <s-table-header>Closes</s-table-header>
              <s-table-header>Fulfillment</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {campaigns.map((campaign) => (
                <s-table-row key={campaign.id}>
                  <s-table-cell>{campaign.campaign_name}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(campaign.status)}>
                      {campaign.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{campaign.starts_at || "Not set"}</s-table-cell>
                  <s-table-cell>{campaign.closes_at || "Not set"}</s-table-cell>
                  <s-table-cell>{campaign.fulfillment_mode}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
