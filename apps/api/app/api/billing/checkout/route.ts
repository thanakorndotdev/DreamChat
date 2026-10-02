import { requireMember } from '@/lib/auth';
import { couponProblem, getCoupon, getPlan, getSubscription, isLive } from '@/lib/billing';
import { db } from '@longrak/db';
import { appUrl, stripe, stripeConfigured } from '@/lib/stripe';

/** The account's Stripe customer, created on first checkout. */
async function customerFor(user: { id: number; username: string; email: string | null; phone: string | null }) {
  const sql = await db();
  const [row] = await sql<{ stripe_customer_id: string | null }[]>`SELECT stripe_customer_id FROM users WHERE id = ${user.id}`;
  if (row.stripe_customer_id) {
    // A customer made with test keys doesn't exist once live keys are in, and vice versa.
    const found = await stripe<{ deleted?: boolean }>('GET', `customers/${row.stripe_customer_id}`).catch(() => null);
    if (found && !found.deleted) return row.stripe_customer_id;
  }
  const customer = await stripe<{ id: string }>('POST', 'customers', {
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    name: user.username,
    metadata: { userId: user.id },
  });
  await sql`UPDATE users SET stripe_customer_id = ${customer.id} WHERE id = ${user.id}`;
  return customer.id;
}

/** Stripe coupons can't be edited, so one is made per code (and remade when the admin changes the code). */
async function stripeCouponFor(code: string) {
  const c = (await getCoupon(code))!;
  if (c.stripeCouponId) return c.stripeCouponId;
  const created = await stripe<{ id: string }>('POST', 'coupons', {
    name: c.code,
    duration: c.duration,
    ...(c.kind === 'percent' ? { percent_off: c.value } : { amount_off: c.value, currency: 'thb' }),
    metadata: { code: c.code },
  });
  const sql = await db();
  await sql`UPDATE coupons SET stripe_coupon_id = ${created.id} WHERE code = ${c.code}`;
  return created.id;
}

export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  if (!stripeConfigured()) return new Response('ยังไม่เปิดรับชำระเงิน', { status: 503 });

  const { planId, code } = await req.json().catch(() => ({}));
  const plan = typeof planId === 'string' ? await getPlan(planId) : null;
  if (!plan || !plan.active || plan.price <= 0) return new Response('ไม่พบแพ็กเกจนี้', { status: 404 });

  const sub = await getSubscription(user.id);
  if (sub && isLive(sub) && sub.source === 'stripe') {
    return new Response('บัญชีนี้สมัครแพ็กเกจอยู่แล้ว เปลี่ยนหรือยกเลิกได้ที่ "จัดการการชำระเงิน"', { status: 409 });
  }

  let couponId: string | undefined;
  let couponCode = '';
  if (typeof code === 'string' && code.trim()) {
    const coupon = await getCoupon(code);
    const problem = await couponProblem(coupon, user.id, plan.id);
    if (problem || !coupon) return new Response(problem, { status: 400 });
    if (coupon.kind === 'free_days') return new Response('โค้ดนี้เป็นโค้ดวันฟรี กดใช้โค้ดได้เลยโดยไม่ต้องชำระเงิน', { status: 400 });
    couponId = await stripeCouponFor(coupon.code);
    couponCode = coupon.code;
  }

  const base = appUrl(req);
  const metadata = { userId: String(user.id), planId: plan.id, code: couponCode };
  try {
    const session = await stripe<{ url: string }>('POST', 'checkout/sessions', {
      mode: 'subscription',
      customer: await customerFor(user),
      client_reference_id: String(user.id),
      locale: 'th',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'thb',
            unit_amount: plan.price,
            recurring: { interval: plan.interval },
            product_data: { name: `หลงรักแชท ${plan.name}` },
          },
        },
      ],
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      metadata,
      subscription_data: { metadata },
      success_url: `${base}/membership?paid=1`,
      cancel_url: `${base}/membership`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'สร้างหน้าชำระเงินไม่สำเร็จ', { status: 502 });
  }
}
