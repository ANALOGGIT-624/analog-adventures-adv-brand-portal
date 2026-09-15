export const PORTAL_TYPES = {
  brandKit: "aa_brand_kit",
  organizationStore: "aa_organization_store",
  campaign: "aa_store_campaign",
  payoutRule: "aa_payout_rule",
  payoutStatement: "aa_payout_statement",
  artworkProof: "$app:artwork_proof",
};

export const REQUIRED_PORTAL_DEFINITIONS = Object.values(PORTAL_TYPES);

export function missingPortalDefinitions(definitions = [], proofDefinition) {
  const installedTypes = new Set(definitions.map(({ type }) => type));
  if (proofDefinition) installedTypes.add(PORTAL_TYPES.artworkProof);
  return REQUIRED_PORTAL_DEFINITIONS.filter(
    (type) => !installedTypes.has(type),
  );
}

export function fieldsToObject(fields = []) {
  return Object.fromEntries(
    fields.flatMap(({ key, value, reference }) => {
      const url = reference?.image?.url || reference?.url;
      return url
        ? [
            [key, value],
            [`${key}_url`, url],
          ]
        : [[key, value]];
    }),
  );
}

export function normalizeMetaobject(node) {
  return {
    id: node.id,
    handle: node.handle,
    displayName: node.displayName,
    updatedAt: node.updatedAt,
    ...fieldsToObject(node.fields),
  };
}

function assertGraphqlResponse(payload) {
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join("; "));
  }
}

export async function getPortalSnapshot(admin) {
  const response = await admin.graphql(
    `#graphql
      query BrandPortalSnapshot(
        $organizationType: String!
        $campaignType: String!
        $payoutRuleType: String!
        $payoutStatementType: String!
        $proofType: String!
      ) {
        definitions: metaobjectDefinitions(first: 100) {
          nodes { type name metaobjectsCount }
        }
        proofDefinition: metaobjectDefinitionByType(type: $proofType) {
          type name metaobjectsCount
        }
        organizations: metaobjects(type: $organizationType, first: 50) {
          nodes { id handle displayName updatedAt fields { key value } }
        }
        campaigns: metaobjects(type: $campaignType, first: 50) {
          nodes { id handle displayName updatedAt fields { key value } }
        }
        payoutRules: metaobjects(type: $payoutRuleType, first: 50) {
          nodes { id handle displayName updatedAt fields { key value } }
        }
        payoutStatements: metaobjects(type: $payoutStatementType, first: 50) {
          nodes { id handle displayName updatedAt fields { key value } }
        }
        proofs: metaobjects(type: $proofType, first: 100) {
          nodes {
            id handle displayName updatedAt
            fields {
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
        organizationType: PORTAL_TYPES.organizationStore,
        campaignType: PORTAL_TYPES.campaign,
        payoutRuleType: PORTAL_TYPES.payoutRule,
        payoutStatementType: PORTAL_TYPES.payoutStatement,
        proofType: PORTAL_TYPES.artworkProof,
      },
    },
  );

  const payload = await response.json();
  assertGraphqlResponse(payload);

  const normalizeConnection = (connection) =>
    connection.nodes.map(normalizeMetaobject);

  return {
    definitions: payload.data.definitions.nodes,
    missingDefinitions: missingPortalDefinitions(
      payload.data.definitions.nodes,
      payload.data.proofDefinition,
    ),
    organizations: normalizeConnection(payload.data.organizations),
    campaigns: normalizeConnection(payload.data.campaigns),
    payoutRules: normalizeConnection(payload.data.payoutRules),
    payoutStatements: normalizeConnection(payload.data.payoutStatements),
    proofs: normalizeConnection(payload.data.proofs),
  };
}

export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function upsertMetaobject(admin, { type, handle, values }) {
  const fields = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ({
      key,
      value: typeof value === "object" ? JSON.stringify(value) : String(value),
    }));
  const response = await admin.graphql(
    `#graphql
      mutation UpsertPortalMetaobject(
        $handle: MetaobjectHandleInput!
        $metaobject: MetaobjectUpsertInput!
      ) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { id handle displayName updatedAt }
          userErrors { field message code }
        }
      }
    `,
    {
      variables: {
        handle: { type, handle },
        metaobject: { handle, fields },
      },
    },
  );

  const payload = await response.json();
  assertGraphqlResponse(payload);
  const result = payload.data.metaobjectUpsert;

  if (result.userErrors.length) {
    throw new Error(result.userErrors.map(({ message }) => message).join("; "));
  }

  return result.metaobject;
}
