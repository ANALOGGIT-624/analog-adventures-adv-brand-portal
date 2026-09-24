import { PORTAL_TYPES, normalizeMetaobject } from "./brand-portal.server.js";

export function artworkShop(destination) {
  const value = String(destination || "")
    .replace(/^https:\/\//, "")
    .replace(/\/$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(value)) {
    throw new Error("Invalid artwork shop.");
  }
  return value;
}

async function query(admin, document, variables) {
  const payload = await (await admin.graphql(document, { variables })).json();
  if (payload.errors?.length || !payload.data)
    throw new Error("Artwork lookup failed.");
  return payload.data;
}

const unavailable = () =>
  new Response("Artwork is unavailable.", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });

// admin must come from authenticated staff or the verified customer session's
// destination shop. Read individual IDs so access is not capped at 100 records.
export async function authorizedArtwork({
  admin,
  shop,
  customerId,
  staff = false,
  kind,
  recordId,
}) {
  if (!staff && !customerId)
    throw new Response("Sign in to download artwork.", { status: 401 });
  if (
    !["proof", "request"].includes(kind) ||
    !/^gid:\/\/shopify\/Metaobject\/\d+$/.test(recordId || "")
  )
    throw unavailable();
  const type =
    kind === "proof"
      ? PORTAL_TYPES.artworkProof
      : PORTAL_TYPES.organizationRequest;
  const data = await query(
    admin,
    `#graphql
    query PrivateArtworkRecord($id: ID!, $type: String!) {
      metaobject(id: $id) { id type handle fields { key value } }
      metaobjectDefinitionByType(type: $type) { type }
    }`,
    { id: recordId, type },
  );
  if (
    !data.metaobject ||
    !data.metaobjectDefinitionByType ||
    data.metaobject.type !== data.metaobjectDefinitionByType.type
  )
    throw unavailable();
  const record = normalizeMetaobject(data.metaobject);
  if (!record.private_asset_id) throw unavailable();
  let companyId = record.company_id;
  const organizationId = record.organization_store_id;
  if (
    kind === "request" &&
    !organizationId &&
    record.request_type !== "new_store"
  )
    throw unavailable();
  if (kind === "proof" && (!organizationId || !record.campaign_id))
    throw unavailable();
  if (organizationId) {
    const result = await query(
      admin,
      `#graphql
      query PrivateArtworkOrganization($id: ID!) {
        metaobject(id: $id) { id type handle fields { key value } }
      }`,
      { id: organizationId },
    );
    if (result.metaobject?.type !== PORTAL_TYPES.organizationStore)
      throw unavailable();
    const organization = normalizeMetaobject(result.metaobject);
    if (
      !organization.company ||
      (kind === "request" && companyId !== organization.company)
    )
      throw unavailable();
    companyId = organization.company;
  }
  if (record.campaign_id) {
    const result = await query(
      admin,
      `#graphql
      query PrivateArtworkCampaign($id: ID!) {
        metaobject(id: $id) { id type handle fields { key value } }
      }`,
      { id: record.campaign_id },
    );
    if (
      result.metaobject?.type !== PORTAL_TYPES.campaign ||
      !organizationId ||
      normalizeMetaobject(result.metaobject).organization_store !==
        organizationId
    )
      throw unavailable();
  }
  if (!companyId) throw unavailable();
  if (!staff) {
    const result = await query(
      admin,
      `#graphql
      query PrivateArtworkCustomer($id: ID!) {
        customer(id: $id) { companyContactProfiles { company { id } } }
      }`,
      { id: customerId },
    );
    if (
      !result.customer?.companyContactProfiles?.some(
        ({ company }) => company.id === companyId,
      )
    )
      throw unavailable();
  }
  return {
    shop: artworkShop(shop),
    assetId: record.private_asset_id,
    filename:
      kind === "proof" ? record.original_filename : record.artwork_filename,
  };
}
