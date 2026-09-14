import { authenticate, unauthenticated } from "../shopify.server";
import {
  PORTAL_TYPES,
  normalizeMetaobject,
} from "../lib/brand-portal.server";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function publicOrganization(organization) {
  return {
    id: organization.id,
    name: organization.store_name,
    slug: organization.slug,
    status: organization.status,
    description: organization.public_description,
    primaryColor: organization.primary_color,
    secondaryColor: organization.secondary_color,
  };
}

function publicCampaign(campaign) {
  return {
    id: campaign.id,
    name: campaign.campaign_name,
    status: campaign.status,
    startsAt: campaign.starts_at,
    closesAt: campaign.closes_at,
    pricingMode: campaign.pricing_mode,
    fulfillmentMode: campaign.fulfillment_mode,
    fundraisingGoal: Number(campaign.fundraising_goal || 0),
    producesAfterClose: campaign.production_after_close === "true",
  };
}

export const loader = async ({ request }) => {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);

  if (!sessionToken.sub) {
    return cors(
      jsonResponse(
        { error: "A signed-in customer account is required." },
        401,
      ),
    );
  }

  const { admin } = await unauthenticated.admin(sessionToken.dest);
  const response = await admin.graphql(
    `#graphql
      query CustomerPortalData(
        $customerId: ID!
        $organizationType: String!
        $campaignType: String!
        $payoutStatementType: String!
      ) {
        customer(id: $customerId) {
          id
          displayName
          companyContactProfiles {
            company { id name }
          }
        }
        organizations: metaobjects(type: $organizationType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        campaigns: metaobjects(type: $campaignType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        payoutStatements: metaobjects(
          type: $payoutStatementType
          first: 100
        ) {
          nodes { id handle displayName fields { key value } }
        }
      }
    `,
    {
      variables: {
        customerId: sessionToken.sub,
        organizationType: PORTAL_TYPES.organizationStore,
        campaignType: PORTAL_TYPES.campaign,
        payoutStatementType: PORTAL_TYPES.payoutStatement,
      },
    },
  );
  const payload = await response.json();

  if (payload.errors?.length) {
    return cors(
      jsonResponse(
        { error: payload.errors.map(({ message }) => message).join("; ") },
        500,
      ),
    );
  }

  const customer = payload.data.customer;
  if (!customer) {
    return cors(jsonResponse({ error: "Customer was not found." }, 404));
  }

  const companyIds = new Set(
    customer.companyContactProfiles.map(({ company }) => company.id),
  );
  const organizations = payload.data.organizations.nodes
    .map(normalizeMetaobject)
    .filter(({ company }) => companyIds.has(company));
  const organizationIds = new Set(organizations.map(({ id }) => id));
  const campaigns = payload.data.campaigns.nodes
    .map(normalizeMetaobject)
    .filter(({ organization_store }) =>
      organizationIds.has(organization_store),
    );
  const campaignIds = new Set(campaigns.map(({ id }) => id));
  const statements = payload.data.payoutStatements.nodes
    .map(normalizeMetaobject)
    .filter(({ campaign }) => campaignIds.has(campaign))
    .map((statement) => ({
      id: statement.id,
      statementId: statement.statement_id,
      status: statement.status,
      periodStart: statement.period_start,
      periodEnd: statement.period_end,
      grossRevenue: Number(statement.gross_revenue || 0),
      refunds: Number(statement.refunds || 0),
      deductions: Number(statement.deductions || 0),
      organizationProceeds: Number(statement.organization_proceeds || 0),
      currency: statement.currency || "USD",
      paidAt: statement.paid_at,
    }));

  return cors(
    jsonResponse({
      customer: { id: customer.id, name: customer.displayName },
      companies: customer.companyContactProfiles.map(({ company }) => company),
      organizations: organizations.map(publicOrganization),
      campaigns: campaigns.map(publicCampaign),
      statements,
    }),
  );
};
