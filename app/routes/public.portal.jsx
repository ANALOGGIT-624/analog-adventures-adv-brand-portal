import { authenticate, unauthenticated } from "../shopify.server";
import {
  PORTAL_TYPES,
  normalizeMetaobject,
  upsertMetaobject,
} from "../lib/brand-portal.server";
import { proofValues } from "../lib/proof-workflow.server";

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

function publicProof(proof) {
  return {
    id: proof.id,
    handle: proof.handle,
    name: proof.proof_name,
    organizationStoreId: proof.organization_store_id,
    campaignId: proof.campaign_id,
    version: Number(proof.version_number || 0),
    status: proof.status,
    assetUrl: proof.asset_file_url,
    filename: proof.original_filename,
    staffNotes: proof.staff_notes,
    organizerNotes: proof.organizer_notes,
    submittedAt: proof.submitted_at,
    reviewedAt: proof.reviewed_at,
  };
}

export const loader = async ({ request }) => {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);

  if (!sessionToken.sub) {
    return cors(
      jsonResponse({ error: "A signed-in customer account is required." }, 401),
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
        $proofType: String!
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
        proofs: metaobjects(type: $proofType, first: 100) {
          nodes {
            id handle displayName fields {
              key value
              reference {
                ... on MediaImage { image { url } }
                ... on GenericFile { url }
              }
            }
          }
        }
      }
    `,
    {
      variables: {
        customerId: sessionToken.sub,
        organizationType: PORTAL_TYPES.organizationStore,
        campaignType: PORTAL_TYPES.campaign,
        payoutStatementType: PORTAL_TYPES.payoutStatement,
        proofType: PORTAL_TYPES.artworkProof,
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
  const proofs = payload.data.proofs.nodes
    .map(normalizeMetaobject)
    .filter(
      ({ organization_store_id, campaign_id }) =>
        organizationIds.has(organization_store_id) &&
        campaignIds.has(campaign_id),
    )
    .map(publicProof);

  return cors(
    jsonResponse({
      customer: { id: customer.id, name: customer.displayName },
      companies: customer.companyContactProfiles.map(({ company }) => company),
      organizations: organizations.map(publicOrganization),
      campaigns: campaigns.map(publicCampaign),
      statements,
      proofs,
    }),
  );
};

export const action = async ({ request }) => {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);
  if (!sessionToken.sub)
    return cors(jsonResponse({ error: "Sign in to review proofs." }, 401));
  let input;
  try {
    input = await request.json();
  } catch {
    return cors(jsonResponse({ error: "Invalid proof review request." }, 400));
  }
  const intent = String(input.intent || "");
  if (!["approve-proof", "request-changes"].includes(intent)) {
    return cors(
      jsonResponse({ error: "Choose approve or request changes." }, 400),
    );
  }
  const handle = String(input.proofHandle || "");
  const notes = String(input.notes || "")
    .trim()
    .slice(0, 2000);
  if (intent === "request-changes" && !notes) {
    return cors(
      jsonResponse({ error: "Describe the requested changes." }, 400),
    );
  }

  const { admin } = await unauthenticated.admin(sessionToken.dest);
  const response = await admin.graphql(
    `#graphql
      query AuthorizeProofReview($customerId: ID!, $organizationType: String!, $proofType: String!) {
        customer(id: $customerId) {
          companyContactProfiles { company { id } }
        }
        organizations: metaobjects(type: $organizationType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        proofs: metaobjects(type: $proofType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
      }
    `,
    {
      variables: {
        customerId: sessionToken.sub,
        organizationType: PORTAL_TYPES.organizationStore,
        proofType: PORTAL_TYPES.artworkProof,
      },
    },
  );
  const payload = await response.json();
  if (payload.errors?.length)
    return cors(
      jsonResponse(
        { error: payload.errors.map(({ message }) => message).join("; ") },
        500,
      ),
    );
  const companyIds = new Set(
    (payload.data.customer?.companyContactProfiles || []).map(
      ({ company }) => company.id,
    ),
  );
  const organizationIds = new Set(
    payload.data.organizations.nodes
      .map(normalizeMetaobject)
      .filter(({ company }) => companyIds.has(company))
      .map(({ id }) => id),
  );
  const proof = payload.data.proofs.nodes
    .map(normalizeMetaobject)
    .find((item) => item.handle === handle);
  if (!proof || !organizationIds.has(proof.organization_store_id)) {
    return cors(
      jsonResponse(
        { error: "That proof is not assigned to your organization." },
        403,
      ),
    );
  }
  if (String(proof.status).toLowerCase() !== "submitted") {
    return cors(
      jsonResponse({ error: "Only a submitted proof can be reviewed." }, 409),
    );
  }
  try {
    await upsertMetaobject(admin, {
      type: PORTAL_TYPES.artworkProof,
      handle: proof.handle,
      values: proofValues(proof, {
        status: intent === "approve-proof" ? "approved" : "changes_requested",
        organizer_notes: notes,
        reviewed_at: new Date().toISOString(),
        reviewed_by_customer_id: sessionToken.sub,
      }),
    });
    return cors(jsonResponse({ ok: true }));
  } catch (error) {
    return cors(
      jsonResponse(
        { error: error instanceof Error ? error.message : String(error) },
        500,
      ),
    );
  }
};
