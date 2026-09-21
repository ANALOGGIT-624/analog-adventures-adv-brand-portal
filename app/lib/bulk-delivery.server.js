import {
  PORTAL_TYPES,
  normalizeMetaobject,
  upsertMetaobject,
} from "./brand-portal.server.js";

export const DELIVERY_TYPE = "$app:organizer_delivery";
import { ADDRESS_FIELDS } from "./delivery-address.js";
export function deliveryHandle(id) {
  if (!/^gid:\/\/shopify\/Metaobject\/\d+$/.test(id))
    throw new Error("Choose an existing organization.");
  return `org-${id.split("/").pop()}`;
}
export function validateAddress(input) {
  const address = {};
  for (const [key, label, required] of ADDRESS_FIELDS) {
    const value = String(input?.[key] || "").trim();
    if (required && !value) throw new Error(`${label} is required.`);
    if (
      value.length > 200 ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32)
    )
      throw new Error(`${label} is invalid.`);
    if (value) address[key] = value;
  }
  address.countryCode = address.countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(address.countryCode))
    throw new Error("Use a two-letter country code, such as US.");
  if (["US", "CA", "AU"].includes(address.countryCode) && !address.provinceCode)
    throw new Error("State / province code is required.");
  if (address.provinceCode)
    address.provinceCode = address.provinceCode.toUpperCase();
  return address;
}
export async function gql(admin, query, variables) {
  const result = await (await admin.graphql(query, { variables })).json();
  if (result.errors?.length)
    throw new Error(result.errors.map((x) => x.message).join("; "));
  return result.data;
}
export async function loadDelivery(admin, organizationId) {
  const data = await gql(
    admin,
    `#graphql
    query OrganizerDelivery($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) { id fields { key value } }
    }`,
    { handle: { type: DELIVERY_TYPE, handle: deliveryHandle(organizationId) } },
  );
  if (!data.metaobjectByHandle) return null;
  const record = normalizeMetaobject(data.metaobjectByHandle);
  if (record.organization_id !== organizationId) return null;
  try {
    return validateAddress(JSON.parse(record.address));
  } catch {
    return null;
  }
}
export async function saveDelivery(admin, organizationId, input) {
  const address = validateAddress(input);
  const data = await gql(
    admin,
    `#graphql
    query DeliveryOrganization($id: ID!) { metaobject(id: $id) { id type } }
  `,
    { id: organizationId },
  );
  if (data.metaobject?.type !== PORTAL_TYPES.organizationStore)
    throw new Error("Organization store no longer exists.");
  return upsertMetaobject(admin, {
    type: DELIVERY_TYPE,
    handle: deliveryHandle(organizationId),
    values: { organization_id: organizationId, address },
  });
}
