import { requireAdmin } from '@/lib/server/auth';
import { listCoupons } from '@/lib/server/billing';
import { getDb } from '@/lib/server/db';
import { parseCoupon } from './parse';

export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  return Response.json(listCoupons());
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const parsed = parseCoupon(body);
  if (typeof parsed === 'string') return new Response(parsed, { status: 400 });
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return new Response('โค้ดใช้ A-Z 0-9 _ - ยาว 3–32 ตัว', { status: 400 });
  const db = getDb();
  if (db.prepare('SELECT 1 FROM coupons WHERE code = ?').get(code)) return new Response('มีโค้ดนี้แล้ว', { status: 409 });
  db.prepare(
    'INSERT INTO coupons (code, kind, value, duration, plan_ids, max_redemptions, expires_at, active, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(code, parsed.kind, parsed.value, parsed.duration, parsed.planIds, parsed.maxRedemptions, parsed.expiresAt, parsed.active, parsed.note, Date.now());
  return new Response(null, { status: 201 });
}
