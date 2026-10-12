import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { recoveryRequestAllowed, createRecoveryBoundary } from '../scripts/recovery-http-boundary.mjs';

test('recovery rejects business actions and alternate route spellings', () => {
  for (const route of ['/app/proofs','/app/proofs.data','/public/portal','/community/stores','/webhooks/orders/create','/app/payouts','/app/fulfillment'])
    for (const method of ['POST','PUT','PATCH','DELETE']) assert.equal(recoveryRequestAllowed(method,route),false,`${method} ${route}`);
  for (const path of ['/assets/../app/payouts','/app/%70roofs','//app','/auth/../app','/auth\\callback','https://other.test/app','/app/payouts','/app/reports','/auth/unknown'])
    assert.equal(recoveryRequestAllowed('GET',path),false,path);
  for (const path of ['/app','/app.data','/app/proofs.data?_routes=routes/app.proofs','/auth/callback?code=example','/public/portal','/assets/example.js'])
    assert.equal(recoveryRequestAllowed('GET',path),true,path);
  assert.equal(recoveryRequestAllowed('POST','/public/artwork'),true);
  assert.equal(recoveryRequestAllowed('POST','/public/artwork.data'),false);
});

test('HTTP boundary never forwards a blocked action and preserves artwork authorization request',async t=>{
 const seen=[];
 const upstream=http.createServer((req,res)=>{let body='';req.on('data',b=>body+=b);req.on('end',()=>{seen.push({method:req.method,url:req.url,auth:req.headers.authorization,body,proto:req.headers['x-forwarded-proto']});res.writeHead(401,{'Content-Type':'application/json'});res.end('{"authorized":false}');});});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
 const boundary=createRecoveryBoundary({upstreamPort:upstream.address().port,publicHost:'recovery.example'});
 boundary.listen(0,'127.0.0.1');await once(boundary,'listening');
 t.after(()=>{boundary.closeAllConnections();boundary.close();upstream.closeAllConnections();upstream.close();});
 const url=`http://127.0.0.1:${boundary.address().port}`;
 for(const path of ['/app/proofs','/public/portal','/app/payouts']) assert.equal((await fetch(url+path,{method:'POST',body:'intent=approve'})).status,405);
 assert.equal(seen.length,0);
 const r=await fetch(url+'/public/artwork',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:'{"recordId":"fixture"}'});
 assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);
 assert.deepEqual(seen,[{method:'POST',url:'/public/artwork',auth:'Bearer synthetic',body:'{"recordId":"fixture"}',proto:'https'}]);
});
