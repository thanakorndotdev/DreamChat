import { requireAdmin } from '@/lib/auth';
import { getCoupon } from '@/lib/billing';
import { db } from '@longrak/db';
import { parseCoupon } from '../parse';

export async function PUT(req: Request, ctx: RouteContext<'/api/admin/coupons/[code]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const coupon = await getCoupon(decodeURIComponent((await ctx.params).code));
  if (!coupon) return new Response('ไม่พบโค้ดนี้', { status: 404 });
  const parsed = await parseCoupon(await req.json().catch(() => ({})));
  if (typeof parsed === 'string') return new Response(parsed, { status: 400 });
  // The Stripe coupon is immutable; drop it when the discount changed so checkout makes a fresh one.
  const sameDiscount = parsed.kind === coupon.kind && parsed.value === coupon.value && parsed.duration === coupon.duration;
  const sql = await db();
  await sql`
    UPDATE coupons SET kind = ${parsed.kind}, value = ${parsed.value}, duration = ${parsed.duration},
      plan_ids = ${parsed.planIds ? sql.json(parsed.planIds) : null}, max_redemptions = ${parsed.maxRedemptions},
      expires_at = ${parsed.expiresAt}, active = ${parsed.active}, note = ${parsed.note},
      stripe_coupon_id = ${sameDiscount ? coupon.stripeCouponId : null}
    WHERE code = ${coupon.code}`;
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/admin/coupons/[code]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const sql = await db();
  await sql`DELETE FROM coupons WHERE code = ${decodeURIComponent((await ctx.params).code)}`;
  return new Response(null, { status: 204 });
}
