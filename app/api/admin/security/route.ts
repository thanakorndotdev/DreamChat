import { requireAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

export type Throttle = { key: string; count: number; limit: number; until: number; blocked: boolean };

/** Throttles still counting (sign-in, sign-up, reports, password changes), busiest first. */
export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const sql = await db();
  const rows = await sql<{ key: string; count: number; lim: number; until: number }[]>`
    SELECT key, count, lim, until FROM rate_limits WHERE until > ${Date.now()} ORDER BY (count::float / lim) DESC, until DESC LIMIT 300`;
  return Response.json(rows.map((r): Throttle => ({ key: r.key, count: r.count, limit: r.lim, until: r.until, blocked: r.count >= r.lim })));
}

/** Lifts one throttle (`?key=`), e.g. for someone locked out after mistyping their password. */
export async function DELETE(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const key = new URL(req.url).searchParams.get('key');
  if (!key) return new Response('ไม่ได้ระบุรายการ', { status: 400 });
  const sql = await db();
  await sql`DELETE FROM rate_limits WHERE key = ${key}`;
  return new Response(null, { status: 204 });
}
