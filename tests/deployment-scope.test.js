import test from "node:test";
import assert from "node:assert/strict";
import { deploymentScope, requireDeploymentIdentity, DEVELOPMENT_SCOPE, LIVE_SCOPE } from "../app/lib/deployment-scope.js";
import { assessPortalCoverage } from "../scripts/recovery/scheduled-portal.mjs";
import { validateDailyPair } from "../scripts/recovery/recovery-sets.mjs";
import { createReadOnlyQuery } from "../scripts/recovery/portal-client.mjs";

test("live activation is explicit and rejects crossed app identities", () => {
  assert.equal(deploymentScope(), DEVELOPMENT_SCOPE);
  assert.equal(deploymentScope({PORTAL_DEPLOYMENT:"live"}), LIVE_SCOPE);
  assert.throws(()=>deploymentScope({PORTAL_DEPLOYMENT:"production"}));
  for (const scope of [DEVELOPMENT_SCOPE,LIVE_SCOPE]) {
    const env={PORTAL_DEPLOYMENT:scope.name,SHOPIFY_API_KEY:scope.appId,SHOPIFY_APP_URL:scope.appUrl};
    assert.equal(requireDeploymentIdentity(env),scope);
    assert.throws(()=>requireDeploymentIdentity({...env,SHOPIFY_API_KEY:"wrong"}));
    assert.throws(()=>requireDeploymentIdentity({...env,SHOPIFY_APP_URL:"https://wrong.example"}));
  }
  assert.throws(()=>requireDeploymentIdentity({SHOPIFY_API_KEY:LIVE_SCOPE.appId,SHOPIFY_APP_URL:LIVE_SCOPE.appUrl}));
});
test("live coverage cannot adopt the development baseline", () => {
  const report={status:"captured",gaps:[],counts:{orders:0}};
  const baseline={store:DEVELOPMENT_SCOPE.shop,acceptedGaps:[],minimumCounts:{orders:0}};
  assert.throws(()=>assessPortalCoverage(report,baseline,LIVE_SCOPE));
  assert.equal(assessPortalCoverage(report,{...baseline,store:LIVE_SCOPE.shop},LIVE_SCOPE).healthy,true);
});
test("backup reader sends live queries only to the explicit live domain", async () => {
  const targets=[];
  const reader=createReadOnlyQuery("synthetic",async url=>{targets.push(url);return {ok:true,status:200,json:async()=>({data:{ok:true}})};},undefined,LIVE_SCOPE);
  await reader("identity");
  assert.deepEqual(targets,[`https://${LIVE_SCOPE.shop}/admin/api/2026-07/graphql.json`]);
});
test("paired recovery rejects cross-environment archives", () => {
  const objects=["objects/"+"a".repeat(64)+".enc","recipient.json","manifest.enc","COMPLETE.json"].map(name=>({name,bytes:1,sha256:"b".repeat(64)}));
  const run="2026-10-13T14-00-00.000Z-11111111-1111-4111-8111-111111111111/";
  const pair=root=>({schema:1,createdAt:"2026-10-13T14:00:00Z",knownGaps:0,database:{prefix:root+run,objects},portal:{prefix:root+"portal/"+run,objects}});
  validateDailyPair(pair(DEVELOPMENT_SCOPE.backupRoot));
  validateDailyPair(pair(LIVE_SCOPE.backupRoot),LIVE_SCOPE.backupRoot);
  assert.throws(()=>validateDailyPair(pair(LIVE_SCOPE.backupRoot)));
  assert.throws(()=>validateDailyPair(pair(DEVELOPMENT_SCOPE.backupRoot),LIVE_SCOPE.backupRoot));
  assert.throws(()=>validateDailyPair({...pair(LIVE_SCOPE.backupRoot),database:pair(DEVELOPMENT_SCOPE.backupRoot).database},LIVE_SCOPE.backupRoot));
  assert.throws(()=>validateDailyPair(pair('arbitrary/'),'arbitrary/'));
});
