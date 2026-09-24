import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { restoreDirectory } from "./archive.mjs";
import { normalizeMetaobject } from "../../app/lib/brand-portal.server.js";
import { reconcileCampaignOrders } from "../../app/lib/payout-reconciliation.server.js";

const exec = promisify(execFile);
export async function restoreDrill({ source, destination, keyFile }) {
  process.umask(0o077);
  const started = Date.now();
  const manifest = await restoreDirectory(source, destination, keyFile);
  const readJson = async (file) =>
    JSON.parse(await readFile(path.join(destination, file), "utf8"));
  const capture = await readJson("capture-report.json");
  const records = await readJson("shopify/metaobjects.json");
  const orders = await readJson("shopify/orders.json");
  const assets = await readJson("artwork/inventory.json");
  const normalized = records.map(normalizeMetaobject);
  const code = `import sqlite3,sys,json,pathlib
root=pathlib.Path(sys.argv[1]).resolve()
db=sqlite3.connect((root/'database/app.sqlite').as_uri()+'?mode=ro',uri=True)
assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
counts={name:db.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0] for name in ('Session','BulkCheckoutAttempt','_prisma_migrations')}
db.close()
catalog=root/'recovery-catalog.sqlite'
if catalog.exists(): raise RuntimeError('Refusing existing catalog')
con=sqlite3.connect(catalog)
con.execute('CREATE TABLE recovered_records (id TEXT PRIMARY KEY, type TEXT NOT NULL, original_json TEXT NOT NULL)')
con.execute('CREATE TABLE recovered_orders (id TEXT PRIMARY KEY, original_json TEXT NOT NULL)')
con.execute('CREATE TABLE recovered_assets (path TEXT PRIMARY KEY, sha256 TEXT NOT NULL, original_json TEXT NOT NULL)')
for r in json.loads((root/'shopify/metaobjects.json').read_text()): con.execute('INSERT INTO recovered_records VALUES (?,?,?)',(r['id'],r['type'],json.dumps(r)))
for r in json.loads((root/'shopify/orders.json').read_text()): con.execute('INSERT INTO recovered_orders VALUES (?,?)',(r['id'],json.dumps(r)))
for r in json.loads((root/'artwork/inventory.json').read_text()): con.execute('INSERT INTO recovered_assets VALUES (?,?,?)',(r['path'],r['sha256'],json.dumps(r)))
con.commit()
assert con.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print(json.dumps({'sourceDatabaseCounts':counts,'catalogRecords':con.execute('SELECT COUNT(*) FROM recovered_records').fetchone()[0],'catalogOrders':con.execute('SELECT COUNT(*) FROM recovered_orders').fetchone()[0],'catalogAssets':con.execute('SELECT COUNT(*) FROM recovered_assets').fetchone()[0]}))
con.close()`;
  const database = JSON.parse(
    (await exec("python3", ["-c", code, destination])).stdout,
  );
  if (
    JSON.stringify(database.sourceDatabaseCounts) !==
    JSON.stringify(capture.database)
  )
    throw new Error("Restored database row counts differ");
  const proofSnapshots = orders.flatMap((order) =>
    (order.attributionManifest?.jsonValue?.lines || [])
      .map((line) => line.artworkProofSnapshot)
      .filter(Boolean),
  );
  const ids = new Set(records.map((r) => r.id));
  const proofChecks = [
    ...new Map(proofSnapshots.map((p) => [p.id, p])).values(),
  ].map((proof) => ({
    proofId: proof.id,
    version: proof.version,
    expectedHash: proof.contentHash,
    metadataAvailable: ids.has(proof.id),
    matchingAssets: assets
      .filter((asset) => asset.sha256 === proof.contentHash)
      .map((asset) => asset.path),
  }));
  const checkpointCampaign = normalized.find(
    (r) =>
      r.campaign_id === "TTW-MULTI" ||
      r.campaign_code === "TTW-MULTI" ||
      r.handle === "ttw-multi",
  );
  let checkpoint = null;
  if (checkpointCampaign) {
    const totals = reconcileCampaignOrders(orders, checkpointCampaign.id);
    checkpoint = {
      campaign: "TTW-MULTI",
      orders: totals.orderCount,
      eligibleUnits: totals.eligibleUnits,
      grossCents: totals.grossRevenueCents,
      refundsCents: totals.refundsCents,
      proceedsCents: totals.proceedsCents,
    };
    checkpoint.matchesSeptember21 =
      checkpoint.orders === 2 &&
      checkpoint.eligibleUnits === 4 &&
      checkpoint.grossCents === 395175 &&
      checkpoint.refundsCents === 88595 &&
      checkpoint.proceedsCents === 2000;
  }
  const report = {
    completedAt: new Date().toISOString(),
    durationSeconds: (Date.now() - started) / 1000,
    archiveIntegrity: "passed",
    restoredFiles: manifest.entries.length,
    database,
    checkpoint,
    proofChecks,
    captureStatus: capture.status,
    unresolvedGaps: capture.gaps,
    operationalRestore:
      "Not performed: this is an isolated offline restore, never an import into Shopify or a running app.",
    pilotGate:
      "not_met: offsite copy, independent key custody, complete historical records, stable hosting and live restore validation are still required",
  };
  await writeFile(
    path.join(destination, "DRILL-REPORT.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  console.log(JSON.stringify(report, null, 2));
  return report;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      destination: { type: "string" },
      key: { type: "string" },
    },
  });
  if (!values.source || !values.destination || !values.key)
    throw new Error("Required: --source --destination --key");
  await restoreDrill({
    source: values.source,
    destination: values.destination,
    keyFile: values.key,
  });
}
