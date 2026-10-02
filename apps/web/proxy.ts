import { type NextRequest, NextResponse } from 'next/server';
import { apiUrl, forwardHeaders } from '@longrak/shared/forward';

/** /api/* goes to the backend. Admin endpoints are only reachable through the admin app. */
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/admin')) return new NextResponse('Not found', { status: 404 });
  const target = new URL(apiUrl() + req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.rewrite(target, { request: { headers: forwardHeaders(req) } });
}

export const config = { matcher: '/api/:path*' };
