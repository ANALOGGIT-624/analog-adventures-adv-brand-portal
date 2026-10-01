import { randomUUID } from "node:crypto";
import process from "node:process";

export const DATABASE_PORTAL_TYPES = new Set([
  "$app:artwork_proof",
  "$app:production_batch",
  "$app:organization_request",
  "$app:organizer_delivery",
]);
export const databasePortalEnabled = () =>
  process.env.PORTAL_DATA_BACKEND === "postgresql";
export function canonicalPortalType(type) {
  return String(type).replace(/^app--416064569345--/, "$app:");
}
export function isPortalRecordId(id) {
  return (
    /^gid:\/\/shopify\/Metaobject\/\d+$/.test(id || "") ||
    /^gid:\/\/analog-portal\/Record\/[0-9a-f-]{36}$/.test(id || "")
  );
}
function assertScope(shop, type) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))
    throw new Error("Invalid portal shop");
  if (!DATABASE_PORTAL_TYPES.has(type))
    throw new Error("Unsupported database portal type");
}
export function recordNode(row) {
  if (!row) return null;
  const values = JSON.parse(row.values);
  return {
    id: row.id,
    type: row.type,
    handle: row.handle,
    displayName: row.displayName,
    updatedAt: row.updatedAt.toISOString(),
    fields: Object.entries(values).map(([key, value]) => ({ key, value })),
  };
}
export function createPortalRecordStore(db, shop) {
  const scope = (type) => {
    assertScope(shop, type);
    return { shop, type };
  };
  return {
    async list(type) {
      return (
        await db.portalRecord.findMany({
          where: scope(type),
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      ).map(recordNode);
    },
    async get(type, id) {
      return recordNode(
        await db.portalRecord.findFirst({ where: { ...scope(type), id } }),
      );
    },
    async byHandle(type, handle) {
      return recordNode(
        await db.portalRecord.findFirst({ where: { ...scope(type), handle } }),
      );
    },
    async upsert(type, handle, values) {
      scope(type);
      if (!handle || handle.length > 255)
        throw new Error("Invalid portal record handle");
      const fields = Object.fromEntries(
        Object.entries(values)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [
            k,
            typeof v === "object" ? JSON.stringify(v) : String(v),
          ]),
      );
      // Serializable updates prevent competing approvals/status changes from silently overwriting each other.
      return db.$transaction(
        async (tx) => {
          const existing = await tx.portalRecord.findUnique({
            where: { shop_type_handle: { shop, type, handle } },
          });
          const prior = existing ? JSON.parse(existing.values) : {};
          if (
            type === "$app:artwork_proof" &&
            existing &&
            prior.status === "approved" &&
            Object.entries(fields).some(([k, v]) => prior[k] !== v)
          )
            throw new Error(
              "Approved proofs are immutable; upload a new version.",
            );
          if (
            type === "$app:production_batch" &&
            existing &&
            ["completed", "cancelled"].includes(prior.status) &&
            Object.entries(fields).some(([k, v]) => prior[k] !== v)
          )
            throw new Error("Completed and cancelled batches are immutable.");
          const merged = { ...prior, ...fields };
          const displayName =
            merged.proof_name ||
            merged.batch_name ||
            merged.request_name ||
            merged.organization_id ||
            handle;
          const data = { values: JSON.stringify(merged), displayName };
          const row = existing
            ? await tx.portalRecord.update({
                where: { shop_id: { shop, id: existing.id } },
                data,
              })
            : await tx.portalRecord.create({
                data: {
                  shop,
                  type,
                  handle,
                  id: `gid://analog-portal/Record/${randomUUID()}`,
                  ...data,
                },
              });
          return recordNode(row);
        },
        { isolationLevel: "Serializable" },
      );
    },
  };
}

const scopes = new WeakMap();
// Resolve the tenant from the authenticated Admin client, never from a form field or record ID.
export async function portalStoreForAdmin(admin) {
  if (!scopes.has(admin)) {
    const resolving = (async () => {
      const payload = await (
        await admin.graphql(
          `query PortalStorageShop { shop { myshopifyDomain } }`,
        )
      ).json();
      if (payload.errors?.length || !payload.data?.shop?.myshopifyDomain)
        throw new Error("Portal shop could not be verified");
      const { default: db } = await import("../db.server.js");
      return createPortalRecordStore(db, payload.data.shop.myshopifyDomain);
    })();
    scopes.set(admin, resolving);
    resolving.catch(() => scopes.delete(admin));
  }
  return scopes.get(admin);
}
export async function databasePortalNodes(admin, type) {
  return (await portalStoreForAdmin(admin)).list(type);
}
