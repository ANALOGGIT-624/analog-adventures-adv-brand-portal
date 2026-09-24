import { Buffer } from "node:buffer";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, copyFile, chmod } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { privateArtworkConfig } from "../../app/lib/private-artwork-storage.server.js";
import { queries } from "./queries.mjs";
import { hashingStream, sha256, sealDirectory, loadKey } from "./archive.mjs";

const exec = promisify(execFile);
const repo = fileURLToPath(new URL("../../", import.meta.url));
export async function collectPages(load, initial = null) {
  const nodes = [],
    cursors = new Set();
  let after = initial;
  for (;;) {
    const page = await load(after);
    if (
      !page ||
      !Array.isArray(page.nodes) ||
      typeof page.pageInfo?.hasNextPage !== "boolean"
    )
      throw new Error("Invalid paginated response");
    nodes.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return nodes;
    after = page.pageInfo.endCursor;
    if (!after || cursors.has(after)) throw new Error("Pagination stalled");
    cursors.add(after);
  }
}
async function privateJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  await writeFile(filename, JSON.stringify(value, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
}
async function sqliteBackup(source, target) {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const code = `import sqlite3,sys,os,json,pathlib
srcpath=pathlib.Path(sys.argv[1]).resolve()
dstpath=pathlib.Path(sys.argv[2]).resolve()
if dstpath.exists(): raise RuntimeError('Refusing overwrite')
src=sqlite3.connect(srcpath.as_uri()+'?mode=ro',uri=True)
dst=sqlite3.connect(dstpath)
src.backup(dst)
assert dst.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
counts={name:dst.execute('SELECT COUNT(*) FROM "'+name+'"').fetchone()[0] for (name,) in dst.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") if name in ('Session','BulkCheckoutAttempt','_prisma_migrations')}
dst.close();src.close();os.chmod(dstpath,0o600)
print(json.dumps(counts))`;
  return JSON.parse(
    (await exec("python3", ["-c", code, source, target])).stdout,
  );
}

export async function capture({
  store,
  output,
  keyFile,
  database,
  evidence = [],
}) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(store))
    throw new Error("Supply a canonical myshopify store");
  process.umask(0o077);
  await loadKey(keyFile);
  const config = await readFile(path.join(repo, "shopify.app.toml"), "utf8");
  const expectedApp = config.match(/^client_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!expectedApp) throw new Error("Missing app identity");
  const base = path.resolve(output),
    stage = path.join(base, "capture");
  await mkdir(base, { mode: 0o700 });
  await mkdir(stage, { mode: 0o700 });
  const report = {
    startedAt: new Date().toISOString(),
    store,
    status: "capturing",
    gaps: [],
    counts: {},
    scope: "Portal recovery data; not a full Shopify store backup",
    consistency:
      "Sequential read-only capture; no cross-service atomic snapshot",
  };
  let sequence = 0;
  async function query(kind, variables = {}) {
    const dir = path.join(stage, "api");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const stem = `${String(++sequence).padStart(4, "0")}-${kind}`;
    const queryFile = path.join(dir, `${stem}.graphql`),
      resultFile = path.join(dir, `${stem}.json`);
    await writeFile(queryFile, queries[kind], { flag: "wx", mode: 0o600 });
    try {
      await exec(
        "shopify",
        [
          "app",
          "execute",
          "--store",
          store,
          "--version",
          "2026-07",
          "--query-file",
          queryFile,
          "--variables",
          JSON.stringify(variables),
          "--output-file",
          resultFile,
        ],
        {
          cwd: repo,
          timeout: 120000,
          maxBuffer: 4 * 1024 * 1024,
          env: {
            ...process.env,
            SHOPIFY_CLI_AGENT_INFO: "n:codex|v:1|p:openai",
            SHOPIFY_CLI_AGENT_IDS:
              "s:01a0d39e-2d2f-7622-aebd-ffd3b166a1ec|r:recovery",
          },
        },
      );
      await chmod(resultFile, 0o600);
      const result = JSON.parse(await readFile(resultFile, "utf8"));
      if (result.errors?.length) throw new Error("GraphQL errors");
      return result.data || result;
    } catch {
      throw new Error(`Shopify read failed: ${kind}`);
    }
  }
  try {
    report.database = await sqliteBackup(
      database,
      path.join(stage, "database/app.sqlite"),
    );
    console.log("Captured SQLite through its backup API; integrity passed.");
    const identity = await query("identity");
    if (
      identity.shop?.myshopifyDomain !== store ||
      identity.currentAppInstallation?.app?.apiKey !== expectedApp
    )
      throw new Error("Shop or app identity mismatch");
    await privateJson(path.join(stage, "shopify/identity.json"), identity);
    if (
      !identity.currentAppInstallation.accessScopes.some(
        (x) => x.handle === "read_all_orders",
      )
    )
      report.gaps.push({
        kind: "order_history_window",
        detail:
          "Token lacks read_all_orders; exports cover only Shopify-accessible order history (normally the most recent 60 days).",
      });
    const definitions = await collectPages(
      async (after) =>
        (await query("definitions", { after })).metaobjectDefinitions,
    );
    await privateJson(
      path.join(stage, "shopify/definitions.json"),
      definitions,
    );
    const records = [];
    const appId = identity.currentAppInstallation.app.id.split("/").pop();
    for (const definition of definitions.filter(
      (d) => d.type.startsWith("aa_") || d.type.startsWith(`app--${appId}--`),
    )) {
      const type = definition.type.startsWith(`app--${appId}--`)
        ? `$app:${definition.type.slice(`app--${appId}--`.length)}`
        : definition.type;
      const values = await collectPages(
        async (after) => (await query("records", { type, after })).metaobjects,
      );
      records.push(...values);
      if (values.length !== definition.metaobjectsCount)
        report.gaps.push({
          kind: "metaobject_count_mismatch",
          type,
          expected: definition.metaobjectsCount,
          captured: values.length,
        });
      console.log(
        `Captured ${type}: ${values.length}/${definition.metaobjectsCount} reported records.`,
      );
    }
    await privateJson(path.join(stage, "shopify/metaobjects.json"), records);
    report.counts.metaobjects = records.length;
    const orders = await collectPages(
      async (after) => (await query("orders", { after })).orders,
    );
    for (const order of orders) {
      if (order.lineItems.pageInfo.hasNextPage)
        order.lineItems.nodes.push(
          ...(await collectPages(
            async (after) =>
              (await query("orderLines", { id: order.id, after })).order
                .lineItems,
            order.lineItems.pageInfo.endCursor,
          )),
        );
      if (order.refunds.length >= 250)
        report.gaps.push({ kind: "refund_limit", orderId: order.id });
      for (const refund of order.refunds) {
        refund.refundLineItems = {
          nodes: await collectPages(
            async (after) =>
              (await query("refundLines", { id: refund.id, after })).refund
                .refundLineItems,
          ),
        };
      }
    }
    await privateJson(path.join(stage, "shopify/orders.json"), orders);
    report.counts.orders = orders.length;
    const historicalIds = new Set(["gid://shopify/Metaobject/427021893817"]);
    for (const order of orders)
      for (const line of order.attributionManifest?.jsonValue?.lines || []) {
        if (line.artworkProofSnapshot?.id)
          historicalIds.add(line.artworkProofSnapshot.id);
      }
    const history = [];
    for (let i = 0; i < historicalIds.size; i += 100) {
      const ids = [...historicalIds].slice(i, i + 100),
        result = await query("historical", { ids });
      ids.forEach((id, index) => {
        history.push({ requestedId: id, record: result.nodes[index] });
        if (!result.nodes[index])
          report.gaps.push({ kind: "inaccessible_historical_record", id });
      });
    }
    await privateJson(
      path.join(stage, "shopify/historical-lookups.json"),
      history,
    );
    const companies = await collectPages(
      async (after) => (await query("companies", { after })).companies,
    );
    for (const company of companies) {
      if (company.contacts.pageInfo.hasNextPage)
        company.contacts.nodes.push(
          ...(await collectPages(
            async (after) =>
              (await query("companyContacts", { id: company.id, after }))
                .company.contacts,
            company.contacts.pageInfo.endCursor,
          )),
        );
      if (company.locations.pageInfo.hasNextPage)
        company.locations.nodes.push(
          ...(await collectPages(
            async (after) =>
              (await query("companyLocations", { id: company.id, after }))
                .company.locations,
            company.locations.pageInfo.endCursor,
          )),
        );
    }
    await privateJson(path.join(stage, "shopify/companies.json"), companies);
    report.counts.companies = companies.length;
    const drafts = await collectPages(
      async (after) => (await query("drafts", { after })).draftOrders,
    );
    for (const draft of drafts) {
      if (draft.lineItems.pageInfo.hasNextPage)
        draft.lineItems.nodes.push(
          ...(await collectPages(
            async (after) =>
              (await query("draftLines", { id: draft.id, after })).draftOrder
                .lineItems,
            draft.lineItems.pageInfo.endCursor,
          )),
        );
    }
    await privateJson(path.join(stage, "shopify/drafts.json"), drafts);
    report.counts.drafts = drafts.length;
    const files = await collectPages(
      async (after) => (await query("files", { after })).files,
    );
    await privateJson(path.join(stage, "shopify/files.json"), files);
    const assets = [];
    await mkdir(path.join(stage, "artwork"), { mode: 0o700 });
    for (const file of files) {
      const url = file.originalSource?.url || file.url || file.image?.url;
      if (!url) {
        report.gaps.push({
          kind: "unavailable_file_bytes",
          id: file.id,
          status: file.fileStatus,
        });
        continue;
      }
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" ||
        ![
          "cdn.shopify.com",
          "shopifycdn.net",
          "shopify-shop-assets.storage.googleapis.com",
        ].some(
          (host) =>
            parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
        )
      ) {
        report.gaps.push({ kind: "unapproved_file_origin", id: file.id });
        continue;
      }
      const local = `artwork/shopify-${sha256(Buffer.from(file.id))}.bin`;
      try {
        const response = await fetch(url, {
          redirect: "error",
          signal: AbortSignal.timeout(120000),
        });
        if (!response.ok || !response.body) throw new Error("Unavailable file");
        let size = 0;
        const limit = new Transform({
          transform(chunk, _e, cb) {
            size += chunk.length;
            cb(
              size > 256 * 1024 * 1024
                ? new Error("File exceeds capture limit")
                : null,
              chunk,
            );
          },
        });
        const digest = hashingStream();
        await pipeline(
          response.body,
          limit,
          digest.stream,
          createWriteStream(path.join(stage, local), {
            flags: "wx",
            mode: 0o600,
          }),
        );
        assets.push({
          source: "shopify",
          id: file.id,
          url,
          path: local,
          contentType: response.headers.get("content-type"),
          ...digest.result(),
        });
      } catch {
        report.gaps.push({ kind: "file_download_failed", id: file.id });
      }
    }
    console.log(
      `Captured Shopify file bytes: ${assets.length}/${files.length}.`,
    );
    const r2Config = privateArtworkConfig(),
      r2 = new S3Client(r2Config.client);
    const listR2 = async () => {
      const objects = [];
      let token;
      do {
        const page = await r2.send(
          new ListObjectsV2Command({
            Bucket: r2Config.bucket,
            ContinuationToken: token,
          }),
        );
        objects.push(...(page.Contents || []));
        const next = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && (!next || next === token))
          throw new Error("R2 pagination stalled");
        token = next;
      } while (token);
      return objects;
    };
    try {
      const objects = await listR2();
      for (const object of objects) {
        const local = `artwork/r2-${sha256(Buffer.from(object.Key))}.bin`;
        const response = await r2.send(
          new GetObjectCommand({
            Bucket: r2Config.bucket,
            Key: object.Key,
            IfMatch: object.ETag,
          }),
        );
        const digest = hashingStream();
        await pipeline(
          response.Body,
          digest.stream,
          createWriteStream(path.join(stage, local), {
            flags: "wx",
            mode: 0o600,
          }),
        );
        const captured = digest.result();
        if (
          captured.bytes !== object.Size ||
          (response.Metadata?.sha256 &&
            response.Metadata.sha256 !== captured.sha256)
        )
          throw new Error("Private artwork integrity mismatch");
        assets.push({
          source: "r2",
          bucket: r2Config.bucket,
          key: object.Key,
          etag: object.ETag,
          metadata: response.Metadata,
          path: local,
          ...captured,
        });
      }
      const end = await listR2();
      const signature = (values) =>
        JSON.stringify(values.map((o) => [o.Key, o.ETag, o.Size]).sort());
      if (signature(objects) !== signature(end))
        report.gaps.push({ kind: "r2_changed_during_capture" });
      report.counts.r2Objects = objects.length;
    } finally {
      r2.destroy();
    }
    await privateJson(path.join(stage, "artwork/inventory.json"), assets);
    report.counts.shopifyFiles = files.length;
    report.counts.downloadedAssets = assets.length;
    // Re-read definitions to detect changes visible during the capture window.
    const endDefinitions = await collectPages(
      async (after) =>
        (await query("definitions", { after })).metaobjectDefinitions,
    );
    const definitionSignature = (defs) =>
      JSON.stringify(
        defs.map((d) => [d.id, d.metaobjectsCount, d.fieldDefinitions]).sort(),
      );
    if (
      definitionSignature(definitions) !== definitionSignature(endDefinitions)
    )
      report.gaps.push({ kind: "definitions_changed_during_capture" });
    await mkdir(path.join(stage, "evidence"), { mode: 0o700 });
    for (let index = 0; index < evidence.length; index++) {
      const target = path.join(
        stage,
        "evidence",
        `${index}-${path.basename(evidence[index])}`,
      );
      await copyFile(evidence[index], target);
      await chmod(target, 0o600);
    }
    await mkdir(path.join(stage, "code"), { mode: 0o700 });
    const { stdout: commit } = await exec("git", ["rev-parse", "HEAD"], {
      cwd: repo,
    });
    report.commit = commit.trim();
    await exec(
      "git",
      ["bundle", "create", path.join(stage, "code/repository.bundle"), "HEAD"],
      { cwd: repo },
    );
    await copyFile(
      path.join(repo, "shopify.app.toml"),
      path.join(stage, "code/shopify.app.toml"),
    );
    await copyFile(
      path.join(repo, "prisma/schema.prisma"),
      path.join(stage, "code/schema.prisma"),
    );
    report.status = report.gaps.length ? "captured_with_gaps" : "captured";
  } catch (error) {
    report.status = "capture_failed";
    report.gaps.push({ kind: "capture_failure", detail: error.message });
  }
  report.finishedAt = new Date().toISOString();
  await privateJson(path.join(stage, "capture-report.json"), report);
  const sealed = await sealDirectory(
    stage,
    path.join(base, "sealed"),
    keyFile,
    {
      store,
      status: report.status,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
    },
  );
  console.log(
    JSON.stringify(
      {
        status: report.status,
        counts: report.counts,
        gaps: report.gaps,
        sealed,
      },
      null,
      2,
    ),
  );
  return report;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      store: { type: "string" },
      output: { type: "string" },
      key: { type: "string" },
      database: { type: "string" },
      evidence: { type: "string", multiple: true },
    },
  });
  if (!values.store || !values.output || !values.key || !values.database)
    throw new Error("Required: --store --output --key --database");
  const report = await capture({
    store: values.store,
    output: values.output,
    keyFile: values.key,
    database: values.database,
    evidence: values.evidence,
  });
  if (report.status === "capture_failed") process.exitCode = 1;
  else if (report.status === "captured_with_gaps") process.exitCode = 2;
}
