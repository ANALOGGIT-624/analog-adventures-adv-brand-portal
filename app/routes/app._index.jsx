import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getPortalSnapshot } from "../lib/brand-portal.server";

/* eslint-disable react/prop-types */

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return getPortalSnapshot(admin);
};

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["live", "active", "approved", "paid"].includes(value)) return "success";
  if (["closed", "archived", "cancelled"].includes(value)) return "critical";
  return "info";
}

function Metric({ label, value, detail }) {
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
        <s-text color="subdued">{detail}</s-text>
      </s-stack>
    </s-box>
  );
}

export default function Dashboard() {
  const data = useLoaderData();
  const liveCampaigns = data.campaigns.filter(
    ({ status }) => String(status).toLowerCase() === "live",
  );
  const unpaidStatements = data.payoutStatements.filter(
    ({ status, organization_proceeds }) =>
      String(status).toLowerCase() !== "paid" &&
      Number(organization_proceeds || 0) > 0,
  );
  const outstandingProceeds = unpaidStatements.reduce(
    (sum, statement) => sum + Number(statement.organization_proceeds || 0),
    0,
  );

  return (
    <s-page
      heading="Analog Adventures Brand Portal"
      subheading="Manage organization micro-stores, campaigns, proofs, and payouts."
    >
      <s-button
        slot="primary-action"
        href="/app/organizations"
        variant="primary"
      >
        Add organization store
      </s-button>

      {data.missingDefinitions.length > 0 && (
        <s-banner heading="Custom-data setup is incomplete" tone="critical">
          Missing definitions: {data.missingDefinitions.join(", ")}
        </s-banner>
      )}

      <s-section heading="Portal overview">
        <s-grid gridTemplateColumns="repeat(5, minmax(0, 1fr))" gap="base">
          <Metric
            label="Organization stores"
            value={data.organizations.length}
            detail="One Shopify store, branded experiences"
          />
          <Metric
            label="Live campaigns"
            value={liveCampaigns.length}
            detail={data.campaigns.length + " total campaigns"}
          />
          <Metric
            label="Proof records"
            value={data.proofs.length}
            detail="Versioned approval trail"
          />
          <Metric
            label="Outstanding proceeds"
            value={new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(outstandingProceeds)}
            detail={unpaidStatements.length + " statement(s) requiring payment"}
          />
          <Metric
            label="Open requests"
            value={
              data.organizationRequests.filter(({ status }) =>
                ["submitted", "in_review", "approved"].includes(
                  String(status).toLowerCase(),
                ),
              ).length
            }
            detail="Organizer proposals awaiting staff action"
          />
        </s-grid>
      </s-section>

      <s-section heading="Organization stores">
        {data.organizations.length === 0 ? (
          <s-box padding="large-200" background="subdued" borderRadius="base">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>Create the first organization store</s-heading>
              <s-paragraph>
                Add a school, instructor, club, church, or nonprofit and connect
                it to the company and brand-kit records already in Shopify.
              </s-paragraph>
              <s-button href="/app/organizations" variant="primary">
                Add organization
              </s-button>
            </s-stack>
          </s-box>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Store</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Public slug</s-table-header>
              <s-table-header>Updated</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.organizations.slice(0, 8).map((organization) => (
                <s-table-row key={organization.id}>
                  <s-table-cell>{organization.store_name}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={statusTone(organization.status)}>
                      {organization.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{organization.slug}</s-table-cell>
                  <s-table-cell>
                    {new Date(organization.updatedAt).toLocaleDateString()}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Launch readiness">
        <s-unordered-list>
          <s-list-item>
            {data.missingDefinitions.length === 0
              ? "Required metaobject definitions found"
              : "Custom-data definitions need attention"}
          </s-list-item>
          <s-list-item>{data.payoutRules.length} payout rule(s)</s-list-item>
          <s-list-item>{data.proofs.length} proof record(s)</s-list-item>
          <s-list-item>
            Customer-account extension requires deployment and editor placement
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
