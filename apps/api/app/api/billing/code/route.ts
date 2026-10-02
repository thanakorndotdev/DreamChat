import { requireMember } from '@/lib/auth';
import { couponProblem, discounted, getCoupon, getPlan, getSubscription, isLive, listPlans } from '@/lib/billing';
import { db } from '@longrak/db';

/**
 * Checks a code. A free-days code is applied on the spot; a discount code comes back with the
 * first-period price for each plan it covers, to be passed on to checkout.
 */
export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string' || !code.trim()) return new Response('กรอกโค้ดก่อน', { status: 400 });

  const coupon = await getCoupon(code);
  const problem = await couponProblem(coupon, user.id, null);
  if (problem || !coupon) return new Response(problem, { status: 400 });

  if (coupon.kind === 'free_days') {
    const plan = coupon.planIds?.[0] ? await getPlan(coupon.planIds[0]) : null;
    if (!plan) return new Response('โค้ดนี้ตั้งค่าแพ็กเกจไม่ถูกต้อง แจ้งแอดมิน', { status: 400 });
    const sub = await getSubscription(user.id);
    if (sub && isLive(sub) && sub.source === 'stripe') {
      return new Response('บัญชีนี้มีแพ็กเกจแบบชำระเงินอยู่แล้ว ใช้โค้ดวันฟรีได้หลังยกเลิกหรือหมดอายุ', { status: 409 });
    }
    // Same plan stacks on top of the days left; a different plan starts today.
    const from = sub && isLive(sub) && sub.planId === plan.id ? sub.currentPeriodEnd : Date.now();
    const until = from + coupon.value * 86_400_000;

    // Lock the code's row so two people redeeming the last use at once can't both get it.
    const sql = await db();
    const granted = await sql.begin(async (tx) => {
      const [locked] = await tx<{ max_redemptions: number | null }[]>`SELECT max_redemptions FROM coupons WHERE code = ${coupon.code} AND active FOR UPDATE`;
      if (!locked) return 'ไม่พบโค้ดนี้ หรือโค้ดถูกปิดใช้แล้ว';
      const [{ n }] = await tx<{ n: number }[]>`SELECT count(*) AS n FROM coupon_redemptions WHERE code = ${coupon.code}`;
      if (locked.max_redemptions !== null && n >= locked.max_redemptions) return 'โค้ดนี้มีคนใช้ครบจำนวนแล้ว';
      const inserted = await tx`
        INSERT INTO coupon_redemptions (code, user_id, at) VALUES (${coupon.code}, ${user.id}, ${Date.now()})
        ON CONFLICT DO NOTHING RETURNING 1`;
      if (!inserted.length) return 'บัญชีนี้ใช้โค้ดนี้ไปแล้ว';
      await tx`
        INSERT INTO subscriptions (user_id, plan_id, source, status, current_period_end, cancel_at_period_end, stripe_subscription_id, updated_at)
        VALUES (${user.id}, ${plan.id}, 'code', 'active', ${until}, true, null, ${Date.now()})
        ON CONFLICT (user_id) DO UPDATE SET plan_id = excluded.plan_id, source = excluded.source, status = excluded.status,
          current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
          stripe_subscription_id = null, updated_at = excluded.updated_at`;
      return true;
    });
    if (granted !== true) return new Response(granted, { status: 400 });
    return Response.json({ kind: 'granted', plan: plan.name, until });
  }

  const plans = (await listPlans()).filter((p) => p.active && p.price > 0 && (!coupon.planIds || coupon.planIds.includes(p.id)));
  if (!plans.length) return new Response('โค้ดนี้ใช้กับแพ็กเกจที่เปิดขายอยู่ไม่ได้', { status: 400 });
  return Response.json({
    kind: 'discount',
    code: coupon.code,
    duration: coupon.duration,
    prices: Object.fromEntries(plans.map((p) => [p.id, discounted(p.price, coupon)])),
  });
}
