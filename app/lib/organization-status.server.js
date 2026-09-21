import { PORTAL_TYPES, upsertMetaobject } from "./brand-portal.server.js";

export const ORGANIZATION_STATUSES = ["draft", "proofing", "scheduled", "live", "closed", "archived"];

export async function updateOrganizationStatus(admin, handle, status) {
  if (!handle || !ORGANIZATION_STATUSES.includes(status)) {
    throw new Error("Choose an existing organization and a valid status.");
  }
  const response = await admin.graphql(`#graphql
    query OrganizationStatusTarget($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) { id handle }
    }`, { variables: { handle: { type: PORTAL_TYPES.organizationStore, handle } } });
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors.map(({ message }) => message).join("; "));
  const organization = payload.data?.metaobjectByHandle;
  if (!organization) throw new Error("Organization store no longer exists. Refresh and try again.");
  // Send only the changed field: never replace identity, relationships, or branding.
  return upsertMetaobject(admin, {
    type: PORTAL_TYPES.organizationStore,
    handle: organization.handle,
    values: { status },
  });
}
