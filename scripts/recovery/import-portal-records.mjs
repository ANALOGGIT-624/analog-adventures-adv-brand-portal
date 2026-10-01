import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DATABASE_PORTAL_TYPES,
  canonicalPortalType,
} from "../../app/lib/portal-records.server.js";

export function planPortalImport({ shop, identity, records, sourceHash }) {
  if (
    identity.shop?.myshopifyDomain !== shop ||
    identity.currentAppInstallation?.app?.apiKey !==
      "8158f984f0ec6fed1e5f85b44a588777"
  )
    throw new Error("Recovery source identity mismatch");
  const all = new Map(records.map((r) => [r.id, r]));
  const ids = new Set(),
    handles = new Set();
  return records
    .filter((r) => DATABASE_PORTAL_TYPES.has(canonicalPortalType(r.type)))
    .map((record) => {
      const type = canonicalPortalType(record.type);
      if (
        !/^gid:\/\/shopify\/Metaobject\/\d+$/.test(record.id) ||
        !record.handle
      )
        throw new Error("Invalid recovery record");
      const fields = Object.fromEntries(
        record.fields.map(({ key, value }) => [key, value]),
      );
      if (
        Object.values(fields).some((v) => v !== null && typeof v !== "string")
      )
        throw new Error("Recovery fields must be strings or null");
      if (!Number.isFinite(Date.parse(record.updatedAt)))
        throw new Error("Recovery timestamp missing or invalid");
      if (ids.has(record.id) || handles.has(type + ":" + record.handle))
        throw new Error("Duplicate recovery record");
      ids.add(record.id);
      handles.add(type + ":" + record.handle);
      const orgId = fields.organization_store_id || fields.organization_id;
      const campaign = fields.campaign_id && all.get(fields.campaign_id);
      if (orgId && all.get(orgId)?.type !== "aa_organization_store")
        throw new Error("Recovery organization missing");
      if (fields.campaign_id && campaign?.type !== "aa_store_campaign")
        throw new Error("Recovery campaign missing");
      const campaignFields = Object.fromEntries(
        (campaign?.fields || []).map((f) => [f.key, f.value]),
      );
      if (orgId && campaign && campaignFields.organization_store !== orgId)
        throw new Error("Recovery ownership mismatch");
      if (
        type === "$app:artwork_proof" &&
        (!orgId ||
          !campaign ||
          !fields.private_asset_id ||
          !fields.content_hash)
      )
        throw new Error("Incomplete private proof recovery record");
      return {
        shop,
        id: record.id,
        type,
        handle: record.handle,
        displayName:
          record.displayName ||
          fields.proof_name ||
          fields.batch_name ||
          record.handle,
        values: JSON.stringify(fields),
        sourceId: record.id,
        importedFrom: sourceHash,
        createdAt: new Date(record.createdAt || record.updatedAt),
        updatedAt: new Date(record.updatedAt),
      };
    });
}
export async function importPortalRecords(db, plan, { apply = false } = {}) {
  return db.$transaction(
    async (tx) => {
      let restored = 0,
        existing = 0;
      for (const row of plan) {
        const prior = await tx.portalRecord.findUnique({
          where: { shop_id: { shop: row.shop, id: row.id } },
        });
        if (prior) {
          if (
            prior.type !== row.type ||
            prior.handle !== row.handle ||
            prior.values !== row.values ||
            prior.importedFrom !== row.importedFrom
          )
            throw new Error("Existing record differs; refusing overwrite");
          existing++;
          continue;
        }
        const collision = await tx.portalRecord.findUnique({
          where: {
            shop_type_handle: {
              shop: row.shop,
              type: row.type,
              handle: row.handle,
            },
          },
        });
        if (collision)
          throw new Error("Recovery handle collision; refusing overwrite");
        if (apply) await tx.portalRecord.create({ data: row });
        restored++;
      }
      return { apply, restored, existing, records: plan.length };
    },
    { isolationLevel: "Serializable" },
  );
}
export async function loadPortalImport(source, shop) {
  const raw = await readFile(path.join(source, "shopify/metaobjects.json"));
  const identity = JSON.parse(
    await readFile(path.join(source, "shopify/identity.json"), "utf8"),
  );
  return planPortalImport({
    shop,
    identity,
    records: JSON.parse(raw),
    sourceHash: createHash("sha256").update(raw).digest("hex"),
  });
}
