import { requireAdmin } from '@/lib/auth';
import { listPlans } from '@/lib/billing';
import { db } from '@longrak/db';
import { DEFAULT_PLANS } from '@longrak/shared/plans';

export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const sql = await db();
  const counts = await sql<{ plan_id: string; n: number }[]>`
    SELECT plan_id, count(*) AS n FROM subscriptions WHERE current_period_end > ${Date.now()} GROUP BY plan_id`;
  const members = new Map(counts.map((c) => [c.plan_id, c.n]));
  return Response.json((await listPlans()).map((p) => ({ ...p, members: members.get(p.id) ?? 0 })));
}

/** New paid plan, starting from Plus's limits. */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { id, name } = await req.json().catch(() => ({}));
  if (typeof id !== 'string' || !/^[a-z0-9-]{2,24}$/.test(id)) return new Response('รหัสแพ็กเกจใช้ a-z 0-9 และ - ยาว 2–24 ตัว', { status: 400 });
  const sql = await db();
  const [exists] = await sql`SELECT 1 FROM plans WHERE id = ${id}`;
  if (exists) return new Response('มีแพ็กเกจรหัสนี้แล้ว', { status: 409 });
  const base = DEFAULT_PLANS[1];
  await sql`
    INSERT INTO plans (id, name, level, price, interval, active, features, perks)
    VALUES (${id}, ${typeof name === 'string' && name.trim() ? name.trim() : id}, ${base.level}, ${base.price}, ${base.interval},
      false, ${sql.json(base.features)}, ${sql.json([])})`;
  return new Response(null, { status: 201 });
}
