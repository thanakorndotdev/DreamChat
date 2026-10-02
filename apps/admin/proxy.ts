import { type NextRequest, NextResponse } from 'next/server';
import { apiUrl, forwardHeaders } from '@longrak/shared/forward';

/** Only what the admin console needs: sign-in and the admin API. */
const ALLOWED = /^\/api\/(admin\/|auth\/(login|logout|me)$)/;

/** /api/* goes to the backend, stamped with ADMIN_PROXY_SECRET so the admin endpoints accept it. */
export function proxy(req: NextRequest) {
  if (!ALLOWED.test(req.nextUrl.pathname)) return new NextResponse('Not found', { status: 404 });
  const target = new URL(apiUrl() + req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.rewrite(target, { request: { headers: forwardHeaders(req, process.env.ADMIN_PROXY_SECRET ?? '') } });
}

export const config = { matcher: '/api/:path*' };
