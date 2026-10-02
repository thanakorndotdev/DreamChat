import { requireMember } from '@/lib/server/auth';
import { couponProblem, discounted, getCoupon, getPlan, getSubscription, isLive, listPlans, recordRedemption, setSubscription } from '@/lib/server/billing';

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
    await setSubscription(user.id, { planId: plan.id, source: 'code', status: 'active', currentPeriodEnd: until, cancelAtPeriodEnd: true, stripeSubscriptionId: null });
    await recordRedemption(coupon.code, user.id);
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
