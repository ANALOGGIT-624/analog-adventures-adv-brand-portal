import { authenticate, unauthenticated } from "../shopify.server";
import {
  PORTAL_TYPES,
  normalizeMetaobject,
  slugify,
  upsertMetaobject,
} from "../lib/brand-portal.server";
import { proofValues } from "../lib/proof-workflow.server";
import { createPrivateArtworkStorage } from "../lib/private-artwork-storage.server";
import { artworkShop } from "../lib/private-artwork-access.server";
import { createOrganizationRequestValues } from "../lib/organization-request.server";
import { publicPayoutStatement } from "../lib/portal-payout";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
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
    organizationStoreId: campaign.organization_store,
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
    assetUrl: proof.private_asset_id ? undefined : proof.asset_file_url,
    downloadRecordId: proof.private_asset_id ? proof.id : undefined,
    filename: proof.original_filename,
    staffNotes: proof.staff_notes,
    organizerNotes: proof.organizer_notes,
    submittedAt: proof.submitted_at,
    reviewedAt: proof.reviewed_at,
  };
}

function publicRequest(request) {
  let details = request.requested_details || {};
  if (typeof details === "string") {
    try {
      details = JSON.parse(details || "{}");
    } catch {
      details = {};
    }
  }
  return {
    id: request.id,
    requestId: request.request_id,
    type: request.request_type,
    status: request.status,
    title: request.request_name,
    organizationId: request.organization_store_id,
    campaignId: request.campaign_id,
    requestedAt: request.requested_at,
    staffNotes: request.staff_notes,
    artworkFilename: request.artwork_filename,
    artworkUrl: request.private_asset_id ? undefined : request.artwork_file_url,
    downloadRecordId: request.private_asset_id ? request.id : undefined,
    artworkUploadedAt: request.artwork_uploaded_at,
    details,
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
        $payoutRuleType: String!
        $proofType: String!
        $requestType: String!
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
        payoutRules: metaobjects(type: $payoutRuleType, first: 100) {
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
        requests: metaobjects(type: $requestType, first: 100) {
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
        payoutRuleType: PORTAL_TYPES.payoutRule,
        proofType: PORTAL_TYPES.artworkProof,
        requestType: PORTAL_TYPES.organizationRequest,
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
  const campaignById = new Map(
    campaigns.map((campaign) => [campaign.id, campaign]),
  );
  const payoutRuleById = new Map(
    payload.data.payoutRules.nodes
      .map(normalizeMetaobject)
      .map((rule) => [rule.id, rule]),
  );
  const statements = payload.data.payoutStatements.nodes
    .map(normalizeMetaobject)
    .filter(({ campaign }) => campaignIds.has(campaign))
    .map((statement) => {
      const campaign = campaignById.get(statement.campaign);
      const payoutRule = payoutRuleById.get(campaign?.payout_rule);
      return publicPayoutStatement(statement, campaign, payoutRule);
    });
  const proofs = payload.data.proofs.nodes
    .map(normalizeMetaobject)
    .filter(
      ({ organization_store_id, campaign_id }) =>
        organizationIds.has(organization_store_id) &&
        campaignById.get(campaign_id)?.organization_store ===
          organization_store_id,
    )
    .map(publicProof);
  const requests = payload.data.requests.nodes
    .map(normalizeMetaobject)
    .filter(({ company_id, organization_store_id, campaign_id }) => {
      if (!companyIds.has(company_id)) return false;
      const organization = organizations.find(
        ({ id }) => id === organization_store_id,
      );
      if (organization_store_id && organization?.company !== company_id)
        return false;
      return (
        !campaign_id ||
        (Boolean(organization) &&
          campaignById.get(campaign_id)?.organization_store === organization.id)
      );
    })
    .map(publicRequest);

  return cors(
    jsonResponse({
      customer: { id: customer.id, name: customer.displayName },
      companies: customer.companyContactProfiles.map(({ company }) => company),
      organizations: organizations.map(publicOrganization),
      campaigns: campaigns.map(publicCampaign),
      statements,
      proofs,
      requests,
    }),
  );
};

export const action = async ({ request }) => {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);
  if (!sessionToken.sub)
    return cors(
      jsonResponse({ error: "Sign in to use the Brand Portal." }, 401),
    );
  let input;
  let artworkFile;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      input = Object.fromEntries(
        [...formData.entries()].flatMap(([key, value]) =>
          typeof value === "string" ? [[key, value]] : [],
        ),
      );
      const uploaded = formData.get("artwork_file");
      if (uploaded instanceof File && uploaded.size > 0) artworkFile = uploaded;
    } else {
      input = await request.json();
    }
  } catch {
    return cors(jsonResponse({ error: "Invalid portal request." }, 400));
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return cors(jsonResponse({ error: "Invalid portal request." }, 400));
  }
  const intent = String(input.intent || "");
  const { admin } = await unauthenticated.admin(sessionToken.dest);

  if (intent === "create-request") {
    const response = await admin.graphql(
      `#graphql
        query AuthorizeOrganizationRequest(
          $customerId: ID!
          $organizationType: String!
          $campaignType: String!
        ) {
          customer(id: $customerId) {
            companyContactProfiles { company { id } }
          }
          organizations: metaobjects(type: $organizationType, first: 100) {
            nodes { id handle displayName fields { key value } }
          }
          campaigns: metaobjects(type: $campaignType, first: 100) {
            nodes { id handle displayName fields { key value } }
          }
        }
      `,
      {
        variables: {
          customerId: sessionToken.sub,
          organizationType: PORTAL_TYPES.organizationStore,
          campaignType: PORTAL_TYPES.campaign,
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
    const companyIds = new Set(
      (payload.data.customer?.companyContactProfiles || []).map(
        ({ company }) => company.id,
      ),
    );
    if (!companyIds.size) {
      return cors(
        jsonResponse(
          { error: "Your account is not connected to an approved company." },
          403,
        ),
      );
    }
    const organizations = payload.data.organizations.nodes
      .map(normalizeMetaobject)
      .filter(({ company }) => companyIds.has(company));
    const organizationId = String(input.organizationId || "");
    const organization = organizations.find(({ id }) => id === organizationId);
    const requestType = String(input.requestType || "");
    if ((organizationId || requestType !== "new_store") && !organization) {
      return cors(
        jsonResponse(
          { error: "Choose an organization assigned to your account." },
          403,
        ),
      );
    }
    const campaigns = payload.data.campaigns.nodes
      .map(normalizeMetaobject)
      .filter(({ organization_store }) =>
        organizations.some(({ id }) => id === organization_store),
      );
    const campaignId = String(input.campaignId || "");
    const campaign = campaigns.find(({ id }) => id === campaignId);
    if (campaignId && !campaign) {
      return cors(jsonResponse({ error: "Choose an assigned campaign." }, 403));
    }
    if (
      campaign &&
      (!organization || campaign.organization_store !== organization.id)
    ) {
      return cors(
        jsonResponse(
          {
            error: "Choose a campaign belonging to the selected organization.",
          },
          403,
        ),
      );
    }
    if (requestType === "campaign_relaunch" && !campaign) {
      return cors(
        jsonResponse({ error: "Choose the campaign to relaunch." }, 400),
      );
    }

    try {
      const requestContext = {
        customerId: sessionToken.sub,
        companyId: organization?.company || [...companyIds][0],
        organizationId: organization?.id,
        campaignId: campaign?.id,
      };
      const values = createOrganizationRequestValues(input, requestContext);
      const uploaded = artworkFile
        ? await createPrivateArtworkStorage().upload({
            shop: artworkShop(sessionToken.dest),
            file: artworkFile,
          })
        : null;
      if (uploaded) {
        Object.assign(values, {
          private_asset_id: uploaded.assetId,
          artwork_filename: artworkFile.name,
          artwork_mime_type: artworkFile.type,
          artwork_content_hash: uploaded.contentHash,
          artwork_uploaded_at: new Date().toISOString(),
        });
      }
      const saved = await upsertMetaobject(admin, {
        type: PORTAL_TYPES.organizationRequest,
        handle: slugify(values.request_id),
        values,
      });
      return cors(
        jsonResponse({
          ok: true,
          request: publicRequest({ id: saved.id, ...values }),
        }),
      );
    } catch (error) {
      return cors(
        jsonResponse(
          { error: error instanceof Error ? error.message : String(error) },
          400,
        ),
      );
    }
  }

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

  const response = await admin.graphql(
    `#graphql
      query AuthorizeProofReview($customerId: ID!, $organizationType: String!, $proofType: String!, $campaignType: String!) {
        customer(id: $customerId) {
          companyContactProfiles { company { id } }
        }
        organizations: metaobjects(type: $organizationType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        proofs: metaobjects(type: $proofType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
        campaigns: metaobjects(type: $campaignType, first: 100) {
          nodes { id handle displayName fields { key value } }
        }
      }
    `,
    {
      variables: {
        customerId: sessionToken.sub,
        organizationType: PORTAL_TYPES.organizationStore,
        proofType: PORTAL_TYPES.artworkProof,
        campaignType: PORTAL_TYPES.campaign,
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
  const campaign = payload.data.campaigns.nodes
    .map(normalizeMetaobject)
    .find((item) => item.id === proof?.campaign_id);
  if (
    !proof ||
    !organizationIds.has(proof.organization_store_id) ||
    !campaign ||
    campaign.organization_store !== proof.organization_store_id
  ) {
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
