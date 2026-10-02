/**
 * Used by the web and admin apps' proxy.ts to hand /api/* to the backend (apps/api).
 * The browser only ever talks to its own app's origin, so the session cookie stays first-party.
 */

/** Header the admin app adds (with ADMIN_PROXY_SECRET) so the backend knows a request came through it. */
export const ADMIN_PROXY_HEADER = 'x-admin-proxy';

export function apiUrl() {
  return (process.env.API_URL || 'http://127.0.0.1:4100').replace(/\/$/, '');
}

/** Request headers for the backend: the original host/scheme for redirects, and never a client-made admin header. */
export function forwardHeaders(req: { headers: Headers; nextUrl: { host: string; protocol: string } }, adminSecret?: string) {
  const headers = new Headers(req.headers);
  headers.delete(ADMIN_PROXY_HEADER);
  headers.set('x-forwarded-host', req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host);
  headers.set('x-forwarded-proto', (req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')).split(',')[0].trim());
  if (adminSecret) headers.set(ADMIN_PROXY_HEADER, adminSecret);
  return headers;
}
