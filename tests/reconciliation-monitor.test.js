import test from "node:test";
import assert from "node:assert/strict";
import { monitoredReconciliation, monitorEndpoint } from "../app/lib/reconciliation-monitor.js";
const url = "https://hc-ping.com/11111111-1111-4111-8111-111111111111";
test("success is sent only after persisted work finishes and carries no data", async () => {
  const calls = [];
  const result = await monitoredReconciliation(async () => { calls.push("work"); return { issues: [], scanned: 11 }; },
    { url, fetcher: async (target, options) => { assert.equal(options.body, ""); assert.equal(options.redirect, "error"); calls.push(target); return { ok: true }; } });
  assert.deepEqual(calls, [url + "/start", "work", url]); assert.equal(result.scanned, 11);
});
test("failed processing signals failure without leaking the error", async () => {
  const calls = [];
  await assert.rejects(monitoredReconciliation(async () => { throw Error("private order"); },
    { url, fetcher: async target => { calls.push(target); return { ok: true }; } }), /^Error: Order reconciliation failed$/);
  assert.deepEqual(calls, [url + "/start", url + "/fail"]);
});
test("review items signal failure rather than healthy completion", async () => {
  const calls = [];
  await monitoredReconciliation(async () => ({ issues: [{ id: "private" }] }),
    { url, fetcher: async target => { calls.push(target); return { ok: true }; } });
  assert.deepEqual(calls, [url + "/start", url + "/fail"]);
});
test("monitor outage does not prevent reconciliation", async () => {
  let processed = false;
  await assert.rejects(monitoredReconciliation(async () => { processed = true; return { issues: [] }; },
    { url, fetcher: async () => { throw Error("network"); } }), /monitor delivery/);
  assert.equal(processed, true);
});
test("invalid destinations never receive a request but processing still runs", async () => {
  for (const bad of ["https://evil.example/", url + "?secret=x", "http://hc-ping.com/x", "https://hc-ping.com:444/" ]) {
    assert.throws(() => monitorEndpoint(bad)); let ran = false;
    await assert.rejects(monitoredReconciliation(async () => { ran = true; }, { url: bad, fetcher: () => { assert.fail(); } }));
    assert.equal(ran, true);
  }
});
test("unconfigured local environments do not send pings", async () => {
  assert.deepEqual(await monitoredReconciliation(async () => ({ issues: [] }), { fetcher: () => assert.fail() }), { issues: [] });
});
