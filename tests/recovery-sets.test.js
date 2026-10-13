import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { sha256 } from '../scripts/recovery/archive.mjs';
import { preserveRecoverySet } from '../scripts/recovery/recovery-sets.mjs';

const root='recovery/postgresql/scheduled/';
const id='11111111-1111-4111-8111-111111111111';
function fixture() {
 const storage=new Map(), writes=[];
 const archive=prefix=>({prefix,objects:[`objects/${'a'.repeat(64)}.enc`,'recipient.json','manifest.enc','COMPLETE.json'].map(name=>{
  const data=Buffer.from(prefix+name); storage.set(prefix+name,data); return {name,bytes:data.length,sha256:sha256(data)};
 })});
 const database=archive(`${root}2026-10-13T12-00-00.000Z-${id}/`);
 const portal={...archive(`${root}portal/2026-10-13T12-00-01.000Z-${id}/`),knownGaps:13};
 const client={send:async command=>{
  const {Key,Body}=command.input;
  if(command.constructor.name==='PutObjectCommand'){writes.push(Key);storage.set(Key,Buffer.from(Body));return {};}
  if(!storage.has(Key))throw Object.assign(new Error('missing'),{name:'NoSuchKey',$metadata:{httpStatusCode:404}});
  return {Body:Readable.from([storage.get(Key)])};
 }};
 return {client,storage,writes,database,portal,now:new Date('2026-10-13T12:01:00Z'),id};
}
test('monthly copy verifies both archives, preserves gaps and publishes marker last',async()=>{
 const f=fixture(),r=await preserveRecoverySet(f);
 assert.equal(r.monthlyCreated,true);
 assert.equal(f.writes.at(-1),`${root}monthly/2026-10/COMPLETE.json`);
 const receipt=JSON.parse(f.storage.get(f.writes.at(-1)));
 assert.equal(receipt.source.knownGaps,13);
 for(const kind of ['database','portal'])for(const o of f[kind].objects)
  assert.deepEqual(f.storage.get(receipt[kind].prefix+o.name),f.storage.get(f[kind].prefix+o.name));
 const before=f.writes.length;
 assert.equal((await preserveRecoverySet({...f,id:'22222222-2222-4222-8222-222222222222'})).monthlyCreated,false);
 assert.equal(f.writes.length,before+1); // only a new daily-pair receipt
});
test('missing database cannot publish a paired or monthly success',async()=>{
 const f=fixture();await assert.rejects(preserveRecoverySet({...f,database:undefined}));assert.equal(f.writes.length,0);
});
test('corrupt source prevents monthly completion and preserves daily source',async()=>{
 const f=fixture(); const key=f.portal.prefix+f.portal.objects[0].name;f.storage.set(key,Buffer.from('corrupt'));
 await assert.rejects(preserveRecoverySet(f),/mismatch/);
 assert.equal(f.storage.has(`${root}monthly/2026-10/COMPLETE.json`),false);
 assert.ok(f.storage.has(key));
});
test('failed monthly read-back cannot publish success',async()=>{
 const f=fixture(),send=f.client.send;f.client.send=async c=>{
  const r=await send(c);if(c.constructor.name==='GetObjectCommand'&&c.input.Key.includes('/monthly/2026-10/'+id))return {Body:Readable.from([Buffer.from('damaged')])};return r;
 };
 await assert.rejects(preserveRecoverySet(f),/mismatch/);
 assert.equal(f.storage.has(`${root}monthly/2026-10/COMPLETE.json`),false);
});
test('access denial is not treated as an empty month',async()=>{
 const f=fixture(),send=f.client.send;f.client.send=async c=>{
  if(c.input.Key===`${root}monthly/2026-10/COMPLETE.json`)throw Object.assign(new Error('denied'),{name:'AccessDenied'});return send(c);
 };
 await assert.rejects(preserveRecoverySet(f),/denied/);assert.equal(f.writes.length,1);
});
test('corrupt existing monthly archive fails without replacing marker',async()=>{
 const f=fixture();const r=await preserveRecoverySet(f);f.storage.set(r.prefix+'portal/manifest.enc',Buffer.from('bad'));
 const before=f.writes.length;await assert.rejects(preserveRecoverySet({...f,id:'22222222-2222-4222-8222-222222222222'}),/mismatch/);
 assert.equal(f.writes.length,before+1);
});
test('UTC month rollover creates a separate complete monthly set',async()=>{
 const f=fixture();await preserveRecoverySet(f);
 const next={...f,now:new Date('2026-11-01T00:00:00Z'),id:'22222222-2222-4222-8222-222222222222'};
 assert.equal((await preserveRecoverySet(next)).month,'2026-11');
 assert.ok(f.storage.has(`${root}monthly/2026-10/COMPLETE.json`));
 assert.ok(f.storage.has(`${root}monthly/2026-11/COMPLETE.json`));
});
