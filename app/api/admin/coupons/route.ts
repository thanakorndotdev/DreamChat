import { requireAdmin } from '@/lib/server/auth';
import { listCoupons } from '@/lib/server/billing';
import { db } from '@/lib/server/db';
import { parseCoupon } from './parse';

export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  return Response.json(await listCoupons());
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const parsed = await parseCoupon(body);
  if (typeof parsed === 'string') return new Response(parsed, { status: 400 });
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return new Response('โค้ดใช้ A-Z 0-9 _ - ยาว 3–32 ตัว', { status: 400 });
  const sql = await db();
  const [exists] = await sql`SELECT 1 FROM coupons WHERE code = ${code}`;
  if (exists) return new Response('มีโค้ดนี้แล้ว', { status: 409 });
  await sql`
    INSERT INTO coupons (code, kind, value, duration, plan_ids, max_redemptions, expires_at, active, note, created_at)
    VALUES (${code}, ${parsed.kind}, ${parsed.value}, ${parsed.duration}, ${parsed.planIds ? sql.json(parsed.planIds) : null},
      ${parsed.maxRedemptions}, ${parsed.expiresAt}, ${parsed.active}, ${parsed.note}, ${Date.now()})`;
  return new Response(null, { status: 201 });
}
