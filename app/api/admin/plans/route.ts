import { requireAdmin } from '@/lib/server/auth';
import { listPlans } from '@/lib/server/billing';
import { getDb } from '@/lib/server/db';
import { DEFAULT_PLANS } from '@/lib/plans';

export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const db = getDb();
  return Response.json(
    listPlans().map((p) => ({
      ...p,
      members: (db.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE plan_id = ? AND current_period_end > ?').get(p.id, Date.now()) as { n: number }).n,
    })),
  );
}

/** New paid plan, starting from Plus's limits. */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { id, name } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !/^[a-z0-9-]{2,24}$/.test(id)) return new Response('รหัสแพ็กเกจใช้ a-z 0-9 และ - ยาว 2–24 ตัว', { status: 400 });
  const db = getDb();
  if (db.prepare('SELECT 1 FROM plans WHERE id = ?').get(id)) return new Response('มีแพ็กเกจรหัสนี้แล้ว', { status: 409 });
  const base = DEFAULT_PLANS[1];
  db.prepare('INSERT INTO plans (id, name, level, price, interval, active, features, perks) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(
    id,
    typeof name === 'string' && name.trim() ? name.trim() : id,
    base.level,
    base.price,
    base.interval,
    JSON.stringify(base.features),
    '[]',
  );
  return new Response(null, { status: 201 });
}
