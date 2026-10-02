import { FREE_PLAN_ID, type PlanFeatures } from '@longrak/shared/plans';
import { requireAdmin } from '@/lib/auth';
import { getPlan } from '@/lib/billing';
import { db } from '@longrak/db';

const int = (v: unknown, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(v) || 0)));

/**
 * Saves the whole plan. A price change applies to new checkouts; people already subscribed keep
 * paying what they signed up for until they change plan in the billing page.
 */
export async function PUT(req: Request, ctx: RouteContext<'/api/admin/plans/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { id } = await ctx.params;
  const plan = await getPlan(id);
  if (!plan) return new Response('ไม่พบแพ็กเกจนี้', { status: 404 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const f = (b.features ?? {}) as Partial<PlanFeatures>;
  const features: PlanFeatures = {
    dailyMessages: int(f.dailyMessages, 0, 1_000_000),
    model: typeof f.model === 'string' ? f.model.trim() : '',
    historyWindow: int(f.historyWindow, 1, 200),
    memoryNotes: int(f.memoryNotes, 0, 200),
    maxCharacters: int(f.maxCharacters, 0, 10_000),
  };
  const isFree = id === FREE_PLAN_ID;
  const price = isFree ? 0 : int(b.price, 0, 100_000_000);
  // Stripe's minimum charge in THB is ฿10.
  if (!isFree && price < 1000) return new Response('ราคาต้องอย่างน้อย ฿10', { status: 400 });
  const perks = Array.isArray(b.perks) ? b.perks.filter((p): p is string => typeof p === 'string' && !!p.trim()).map((p) => p.trim()) : plan.perks;

  const sql = await db();
  await sql`
    UPDATE plans SET
      name = ${typeof b.name === 'string' && b.name.trim() ? b.name.trim() : plan.name},
      level = ${isFree ? 0 : int(b.level, 1, 2)},
      price = ${price},
      interval = ${b.interval === 'year' ? 'year' : 'month'},
      active = ${isFree || !!b.active},
      features = ${sql.json(features)},
      perks = ${sql.json(perks)}
    WHERE id = ${id}`;
  return new Response(null, { status: 204 });
}
