import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  createPortalRecordStore,
  isPortalRecordId,
} from "../app/lib/portal-records.server.js";
import {
  planPortalImport,
  importPortalRecords,
} from "../scripts/recovery/import-portal-records.mjs";

const shop = "test.myshopify.com",
  type = "$app:artwork_proof";
const node = (id, type, values) => ({
  id,
  type,
  handle: id.split("/").pop(),
  updatedAt: "2026-10-01T12:00:00Z",
  fields: Object.entries(values).map(([key, value]) => ({ key, value })),
});
const org = "gid://shopify/Metaobject/1",
  campaign = "gid://shopify/Metaobject/2",
  proof = "gid://shopify/Metaobject/3";
function plan() {
  return planPortalImport({
    shop,
    sourceHash: "verified-source-hash",
    identity: {
      shop: { myshopifyDomain: shop },
      currentAppInstallation: {
        app: { apiKey: "8158f984f0ec6fed1e5f85b44a588777" },
      },
    },
    records: [
      node(org, "aa_organization_store", { company: "company1" }),
      node(campaign, "aa_store_campaign", { organization_store: org }),
      node(proof, "app--416064569345--artwork_proof", {
        proof_name: "Recovered proof",
        organization_store_id: org,
        campaign_id: campaign,
        status: "approved",
        private_asset_id: "asset1",
        content_hash: "hash1",
        organizer_notes: null,
        reviewed_at: "2026-10-01T11:00:00Z",
      }),
    ],
  });
}
test("database recovery preserves identity, is idempotent, and isolates tenants and types", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "portal-record-test-"));
  const db = new PrismaClient({
    datasources: { db: { url: `file:${dir}/test.sqlite` } },
  });
  try {
    const sql = await readFile(
      new URL(
        "../prisma/migrations/20261001000000_portal_records/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await db.$executeRawUnsafe(statement);
    assert.deepEqual(await importPortalRecords(db, plan()), {
      apply: false,
      restored: 1,
      existing: 0,
      records: 1,
    });
    assert.equal(await db.portalRecord.count(), 0);
    await importPortalRecords(db, plan(), { apply: true });
    assert.equal(
      (await importPortalRecords(db, plan(), { apply: true })).existing,
      1,
    );
    const store = createPortalRecordStore(db, shop),
      other = createPortalRecordStore(db, "other.myshopify.com");
    const restored = await store.get(type, proof);
    assert.equal(restored.id, proof);
    assert.equal(
      restored.fields.find((f) => f.key === "reviewed_at").value,
      "2026-10-01T11:00:00Z",
    );
    assert.equal(
      restored.fields.find((f) => f.key === "organizer_notes").value,
      null,
    );
    assert.equal(await other.get(type, proof), null);
    assert.equal(await store.get("$app:organization_request", proof), null);
    await assert.rejects(
      store.upsert(type, "3", { status: "submitted" }),
      /immutable/,
    );
    const newRow = await store.upsert(
      "$app:organization_request",
      "request-1",
      { status: "submitted", company_id: "company1" },
    );
    assert.ok(isPortalRecordId(newRow.id));
    await store.upsert("$app:organization_request", "request-1", {
      status: "reviewed",
    });
    assert.equal(
      (
        await store.byHandle("$app:organization_request", "request-1")
      ).fields.find((f) => f.key === "company_id").value,
      "company1",
    );
    const conflict = plan();
    conflict[0].values = '{"status":"different"}';
    await assert.rejects(
      importPortalRecords(db, conflict, { apply: true }),
      /refusing overwrite/,
    );
    assert.equal(await db.portalRecord.count(), 2);
  } finally {
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
});

test("recovery rejects wrong shop and broken reference chains", () => {
  const x = plan()[0];
  assert.ok(x.sourceId === proof);
  assert.throws(
    () =>
      planPortalImport({ shop, identity: {}, records: [], sourceHash: "x" }),
    /identity/,
  );
  const identity = {
    shop: { myshopifyDomain: shop },
    currentAppInstallation: {
      app: { apiKey: "8158f984f0ec6fed1e5f85b44a588777" },
    },
  };
  assert.throws(
    () =>
      planPortalImport({
        shop,
        identity,
        sourceHash: "x",
        records: [node(proof, type, { campaign_id: campaign })],
      }),
    /campaign/,
  );
});
