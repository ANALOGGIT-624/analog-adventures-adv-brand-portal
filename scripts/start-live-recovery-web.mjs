import process from 'node:process';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { createRecoveryBoundary } from './recovery-http-boundary.mjs';

import { LIVE_RECOVERY_URL as expected, assertLiveRecoveryTarget } from './live-recovery-target.mjs';
assertLiveRecoveryTarget(process.env);
const port = Number(process.env.PORT || 3000);
const upstreamPort = port === 3001 ? 3002 : 3001;
const require = createRequire(import.meta.url);
const cli = resolve(dirname(require.resolve('@react-router/serve/package.json')), 'dist/cli.js');
const child = spawn(process.execPath, [cli, './build/server/index.js'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(upstreamPort) },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const server = createRecoveryBoundary({ upstreamPort, publicHost: new URL(expected).host });
server.listen(port, '0.0.0.0');
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  child.kill('SIGTERM');
  setTimeout(() => { child.kill('SIGKILL'); process.exit(1); }, 10000).unref();
}
server.on('error', stop);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, stop);
child.on('exit', code => { server.close(); process.exit(code ?? 1); });
child.on('error', stop);
