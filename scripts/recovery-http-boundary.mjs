import http from 'node:http';

const reads = new Set([
  // React Router's lazy route discovery returns asset metadata, not loader data.
  '/__manifest',
  '/', '/health', '/app', '/app.data', '/app/proofs', '/app/proofs.data',
  '/app/artwork', '/app/artwork.data', '/public/portal', '/public/artwork',
  '/auth', '/auth/login', '/auth/login.data', '/auth/callback',
  '/auth/session-token', '/auth/exit-iframe',
]);

// This gateway is only for the isolated recovery drill. Keep its allowlist
// independent of UI visibility: hidden buttons do not prevent route actions.
export function recoveryRequestAllowed(method, target) {
  if (!target?.startsWith('/') || target.startsWith('//')) return false;
  const pathname = target.split('?')[0];
  // Reject alternate encodings and normalization rather than letting the proxy
  // and application interpret the same request differently.
  if (/[\\%#]/.test(pathname) || pathname.split('/').some(p => p === '.' || p === '..')) return false;
  if (method === 'GET' || method === 'HEAD')
    return reads.has(pathname) || /^\/assets\/[a-zA-Z0-9_./-]+$/.test(pathname);
  if (method === 'OPTIONS') return ['/public/portal', '/public/artwork'].includes(pathname);
  // Artwork POST only issues a signed download URL after authorization.
  return method === 'POST' && pathname === '/public/artwork';
}

export function createRecoveryBoundary({ upstreamPort, publicHost }) {
  return http.createServer((request, response) => {
    if (!recoveryRequestAllowed(request.method, request.url)) {
      response.writeHead(405, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      response.end('Recovery verification is read-only.');
      return;
    }
    const upstream = http.request({
      host: '127.0.0.1', port: upstreamPort, method: request.method,
      path: request.url,
      headers: { ...request.headers, host: publicHost, 'x-forwarded-host': publicHost, 'x-forwarded-proto': 'https' },
    }, result => {
      response.writeHead(result.statusCode, { ...result.headers, 'cache-control': 'private, no-store' });
      result.pipe(response);
    });
    upstream.setTimeout(60000, () => upstream.destroy());
    upstream.on('error', () => {
      if (!response.headersSent) response.writeHead(503, { 'Cache-Control': 'no-store' });
      response.end('Recovery service unavailable.');
    });
    request.on('aborted', () => upstream.destroy());
    request.pipe(upstream);
  });
}
