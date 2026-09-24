import process from "node:process";
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export function canonical(rows) {
  return rows.map(row => Object.fromEntries(Object.keys(row).sort().map(key => {
    const value = row[key];
    return [key, typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : value];
  }))).sort((a,b) => a.id.localeCompare(b.id));
}

export async function importRecords(target, records, { commit = false } = {}) {
  const counts = Object.fromEntries(Object.entries(records).map(([key, rows]) => [key, rows.length]));
  const rollback = new Error('Verified dry run rollback');
  try {
    await target.$transaction(async tx => {
      // Block concurrent inserts until verification/commit finishes.
      await tx.$executeRawUnsafe('LOCK TABLE "Session", "BulkCheckoutAttempt" IN ACCESS EXCLUSIVE MODE');
      for (const model of ['session', 'bulkCheckoutAttempt']) {
        if (await tx[model].count()) throw new Error(`Refusing populated target: ${model}`);
      }
      for (const model of ['session', 'bulkCheckoutAttempt']) {
        for (const data of records[model]) await tx[model].create({ data });
        assert.deepEqual(canonical(await tx[model].findMany()), canonical(records[model]), `Record mismatch: ${model}`);
      }
      if (!commit) throw rollback;
    }, { isolationLevel: 'Serializable', timeout: 60000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  return { status: commit ? 'committed_and_verified' : 'verified_and_rolled_back', counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: {
    'sqlite-client': {type:'string'}, 'postgres-client': {type:'string'},
    source: {type:'string'}, 'expected-host': {type:'string'}, shop: {type:'string'}, commit: {type:'boolean',default:false},
  }});
  for (const name of ['sqlite-client','postgres-client','source','expected-host','shop']) if (!values[name]) throw Error(`Missing --${name}`);
  const url = new URL(process.env.DATABASE_URL);
  if (!['postgresql:','postgres:'].includes(url.protocol) || url.hostname !== values['expected-host'] || url.searchParams.get('sslmode') !== 'require') throw Error('Unexpected target or missing required TLS');
  const {PrismaClient: SQLite} = await import(pathToFileURL(path.resolve(values['sqlite-client'])));
  const {PrismaClient: Postgres} = await import(pathToFileURL(path.resolve(values['postgres-client'])));
  const source = new SQLite({datasources:{db:{url:`file:${path.resolve(values.source)}`}}});
  const target = new Postgres();
  try {
    const [session, bulkCheckoutAttempt] = await source.$transaction([source.session.findMany(),source.bulkCheckoutAttempt.findMany()]);
    for (const row of [...session,...bulkCheckoutAttempt]) if (row.shop !== values.shop) throw Error('Unexpected source shop');
    const result = await importRecords(target, {session,bulkCheckoutAttempt}, {commit:values.commit});
    if (!values.commit) {
      assert.equal(await target.session.count(),0);
      assert.equal(await target.bulkCheckoutAttempt.count(),0);
    } else {
      assert.deepEqual(canonical(await target.session.findMany()),canonical(session));
      assert.deepEqual(canonical(await target.bulkCheckoutAttempt.findMany()),canonical(bulkCheckoutAttempt));
    }
    console.log(JSON.stringify(result));
  } catch (error) {
    if (error.message?.startsWith("Refusing populated target:")) console.error(error.message);
    // ORM errors can embed row contents or connection credentials.
    console.error('Import failed; no success claimed. Inspect privately. Transactional writes roll back on validation failure.');
    process.exitCode=1;
  } finally {
    await source.$disconnect(); await target.$disconnect();
  }
}
