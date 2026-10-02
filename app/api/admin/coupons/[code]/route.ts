import { requireAdmin } from '@/lib/server/auth';
import { getCoupon } from '@/lib/server/billing';
import { getDb } from '@/lib/server/db';
import { parseCoupon } from '../parse';

export async function PUT(req: Request, ctx: RouteContext<'/api/admin/coupons/[code]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const coupon = getCoupon(decodeURIComponent((await ctx.params).code));
  if (!coupon) return new Response('ไม่พบโค้ดนี้', { status: 404 });
  const parsed = parseCoupon(await req.json().catch(() => ({})));
  if (typeof parsed === 'string') return new Response(parsed, { status: 400 });
  // The Stripe coupon is immutable; drop it when the discount changed so checkout makes a fresh one.
  const sameDiscount = parsed.kind === coupon.kind && parsed.value === coupon.value && parsed.duration === coupon.duration;
  getDb()
    .prepare(
      'UPDATE coupons SET kind = ?, value = ?, duration = ?, plan_ids = ?, max_redemptions = ?, expires_at = ?, active = ?, note = ?, stripe_coupon_id = ? WHERE code = ?',
    )
    .run(
      parsed.kind,
      parsed.value,
      parsed.duration,
      parsed.planIds,
      parsed.maxRedemptions,
      parsed.expiresAt,
      parsed.active,
      parsed.note,
      sameDiscount ? coupon.stripeCouponId : null,
      coupon.code,
    );
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/admin/coupons/[code]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  getDb().prepare('DELETE FROM coupons WHERE code = ?').run(decodeURIComponent((await ctx.params).code));
  return new Response(null, { status: 204 });
}
