import process from "node:process";
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const moduleUrl = new URL("../scripts/recovery/job-lifecycle.mjs", import.meta.url).href;
function run(body) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", `import {runBackupJob} from ${JSON.stringify(moduleUrl)}; ${body}`], {stdio:["ignore","pipe","pipe"]});
    let output = "";
    child.stdout.on("data", x => output += x);
    child.stderr.on("data", x => output += x);
    const guard = setTimeout(() => {child.kill(); reject(new Error("Job did not exit"));}, 3000);
    child.on("error", reject);
    child.on("close", code => {clearTimeout(guard); resolve({code,output});});
  });
}
test("completed cleanup exits despite a lingering SDK-style timer", async () => {
  const result = await run(`setInterval(()=>{},1000); await runBackupJob({database:async()=>{},portal:async()=>{await new Promise(r=>setTimeout(r,20));console.log('cleanup-done')}});`);
  assert.equal(result.code, 0);
  assert.ok(result.output.indexOf('cleanup-done') < result.output.indexOf('backupJobComplete'));
});
test("database failure still runs portal and exits unsuccessfully without leaking errors", async () => {
  const result = await run(`await runBackupJob({database:async()=>{throw Error('secret')},portal:async()=>console.log('portal-ran')});`);
  assert.equal(result.code, 1);
  assert.match(result.output, /portal-ran/);
  assert.doesNotMatch(result.output, /secret/);
});
test("cleanup failure cannot produce successful exit", async () => {
  const result = await run(`await runBackupJob({database:async()=>{},portal:async()=>{try{}finally{throw Error('cleanup')}}});`);
  assert.equal(result.code, 1);
});
test("stalled cleanup remains bounded and fails", async () => {
  const result = await run(`await runBackupJob({database:async()=>new Promise(()=>{}),timeoutMs:30});`);
  assert.equal(result.code, 1);
  assert.doesNotMatch(result.output, /backupJobComplete/);
});
