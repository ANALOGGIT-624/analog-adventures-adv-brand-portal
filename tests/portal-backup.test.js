import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { capture } from "../scripts/recovery/capture.mjs";
import { createKey, sha256 } from "../scripts/recovery/archive.mjs";
import { createReadOnlyQuery, BACKUP_STORE } from "../scripts/recovery/portal-client.mjs";
import { assessPortalCoverage } from "../scripts/recovery/scheduled-portal.mjs";

test("backup reader is pinned to the pilot, refuses unknown operations and does not follow redirects", async () => {
  const requests = [];
  const query = createReadOnlyQuery("synthetic-token", async (url, options) => {
    requests.push({url,options});return {ok:true,status:200,json:async()=>({data:{shop:{myshopifyDomain:BACKUP_STORE}}})};
  });
  await query("identity");
  assert.equal(requests[0].url, `https://${BACKUP_STORE}/admin/api/2026-07/graphql.json`);
  assert.equal(requests[0].options.redirect, "error");
  assert.match(JSON.parse(requests[0].options.body).query, /^query /);
  await assert.rejects(query("mutation"), /Unknown backup query/);
  await assert.rejects(query("constructor"), /Unknown backup query/);
  assert.equal(requests.length, 1);
});

test("R2 capture preserves bytes and metadata, rejects bad hashes and reports concurrent changes", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "portal-r2-fixture-"));
  t.after(() => rm(root, { recursive:true, force:true }));
  const keyFile = path.join(root, "key"); await createKey(keyFile);
  const bytes = Buffer.from([0, 1, 255, 10]);
  const empty = { nodes:[], pageInfo:{hasNextPage:false} };
  const queryExecutor = async kind => {
    if (kind === "identity") return {shop:{myshopifyDomain:BACKUP_STORE},currentAppInstallation:{app:{apiKey:"8158f984f0ec6fed1e5f85b44a588777",id:"gid://shopify/App/1"},accessScopes:[{handle:"read_all_orders"}]}};
    if (kind === "historical") return {nodes:[{id:"gid://shopify/Metaobject/427021893817"}]};
    return {[{definitions:"metaobjectDefinitions",orders:"orders",companies:"companies",drafts:"draftOrders",files:"files"}[kind]]:empty};
  };
  for (const scenario of ["good", "hash", "changed"]) {
    let lists=0;const requests=[];
    const artworkClient={destroy(){},async send(command){requests.push(command.input);
      if(command.constructor.name === "ListObjectsV2Command") {lists++;return {Contents:[{Key:"artwork/synthetic",ETag:scenario==="changed"&&lists===2?"changed":"original",Size:bytes.length}]};}
      return {Body:Readable.from([bytes]),Metadata:{sha256:scenario==="hash"?"bad":sha256(bytes)}};
    }};
    const output=path.join(root,scenario);
    const report=await capture({store:BACKUP_STORE,output,keyFile,queryExecutor,includeRepositoryHistory:false,seal:false,artworkConfig:{bucket:"synthetic-bucket",client:{}},artworkClient});
    if(scenario==="good") {
      assert.equal(report.status,"captured");assert.equal(report.counts.r2Objects,1);
      const inventory=JSON.parse(await readFile(path.join(output,"capture/artwork/inventory.json"),"utf8"));
      assert.deepEqual(await readFile(path.join(output,"capture",inventory[0].path)),bytes);
      assert.equal(inventory[0].sha256,sha256(bytes));assert.equal(requests[1].IfMatch,"original");
    } else if(scenario==="hash") assert.equal(report.status,"capture_failed");
    else assert.ok(report.gaps.some(g=>g.kind==="r2_changed_during_capture"));
  }
});

test("backup reader retries throttling, bounds retries and suppresses API errors", async () => {
  let attempts = 0;
  const query = createReadOnlyQuery("synthetic-token", async () => {
    attempts++;
    return {ok:true,status:200,json:async()=>attempts===1?{errors:[{extensions:{code:"THROTTLED"}}]}:{data:{ok:true}}};
  }, async()=>{});
  assert.deepEqual(await query("identity"), {ok:true});assert.equal(attempts,2);
  const failing = createReadOnlyQuery("synthetic-token", async()=>({ok:false,status:401,json:async()=>({errors:[{message:"sensitive fixture"}]})}));
  await assert.rejects(failing("identity"), error => error.message === "Shopify backup query failed");
  attempts=0;
  const throttled=createReadOnlyQuery("synthetic-token",async()=>{attempts++;return {ok:false,status:429,json:async()=>({})};},async()=>{});
  await assert.rejects(throttled("identity"), /retry limit/);assert.equal(attempts,5);
});

test("accepted historical limitations never allow new gaps, count regressions or a failed capture", () => {
  const gap={kind:"inaccessible_historical_record",id:"synthetic-old"};
  const baseline={store:BACKUP_STORE,acceptedGaps:[gap],minimumCounts:{metaobjects:3,downloadedAssets:2}};
  const report={status:"captured_with_gaps",gaps:[gap],counts:{metaobjects:3,downloadedAssets:2}};
  assert.equal(assessPortalCoverage(report,baseline).healthy,true);
  assert.equal(assessPortalCoverage({...report,gaps:[gap,{...gap,id:"synthetic-new"}]},baseline).healthy,false);
  assert.equal(assessPortalCoverage({...report,counts:{metaobjects:2,downloadedAssets:2}},baseline).healthy,false);
  assert.equal(assessPortalCoverage({...report,status:"capture_failed"},baseline).healthy,false);
  assert.throws(()=>assessPortalCoverage(report,{...baseline,store:"another.myshopify.com"}), /baseline required/);
});
