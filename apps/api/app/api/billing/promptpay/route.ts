import { requireMember } from '@/lib/auth';
import { couponProblem, discounted, getCoupon, getPlan, getSubscription, isLive } from '@/lib/billing';
import { openPromptPay, savePromptPay } from '@/lib/promptpay';
import { stripe, stripeConfigured } from '@/lib/stripe';

/** Stripe's smallest PromptPay charge is ฿10. */
const MIN_AMOUNT = 1000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type QrIntent = {
  id: string;
  next_action?: { promptpay_display_qr_code?: { data: string; image_url_svg: string } };
};

/**
 * Makes a PromptPay QR for one period of a plan. Stripe needs an email on every PromptPay payment;
 * accounts without one are asked for it (422) and it's only passed on to Stripe, not saved.
 */
export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  if (!stripeConfigured()) return new Response('ยังไม่เปิดรับชำระเงิน', { status: 503 });

  const { planId, code, email } = await req.json().catch(() => ({}));
  const plan = typeof planId === 'string' ? await getPlan(planId) : null;
  if (!plan || !plan.active || plan.price <= 0) return new Response('ไม่พบแพ็กเกจนี้', { status: 404 });

  const sub = await getSubscription(user.id);
  if (sub && isLive(sub) && sub.source === 'stripe') {
    return new Response('บัญชีนี้ต่ออายุอัตโนมัติด้วยบัตรอยู่แล้ว ยกเลิกที่ "จัดการการชำระเงิน" ก่อนจ่ายด้วย PromptPay', { status: 409 });
  }

  let couponCode: string | null = null;
  let amount = plan.price;
  if (typeof code === 'string' && code.trim()) {
    const coupon = await getCoupon(code);
    const problem = await couponProblem(coupon, user.id, plan.id);
    if (problem || !coupon) return new Response(problem, { status: 400 });
    if (coupon.kind === 'free_days') return new Response('โค้ดนี้เป็นโค้ดวันฟรี กดใช้โค้ดได้เลยโดยไม่ต้องชำระเงิน', { status: 400 });
    couponCode = coupon.code;
    amount = discounted(plan.price, coupon);
  }
  if (amount < MIN_AMOUNT) return new Response('ยอดหลังหักส่วนลดต่ำกว่า ฿10 จ่ายด้วย PromptPay ไม่ได้', { status: 400 });

  const open = await openPromptPay(user.id, plan.id, amount);
  if (open) return Response.json(open);

  const receiptEmail = user.email ?? (typeof email === 'string' && EMAIL.test(email.trim()) ? email.trim() : null);
  if (!receiptEmail) return new Response('กรอกอีเมลสำหรับรับใบเสร็จก่อน', { status: 422 });

  try {
    const pi = await stripe<QrIntent>('POST', 'payment_intents', {
      amount,
      currency: 'thb',
      confirm: true,
      payment_method_types: ['promptpay'],
      payment_method_data: { type: 'promptpay', billing_details: { email: receiptEmail } },
      description: `หลงรักแชท ${plan.name} (${plan.interval === 'year' ? '1 ปี' : '1 เดือน'})`,
      metadata: { kind: 'promptpay', userId: String(user.id), planId: plan.id, code: couponCode ?? '' },
    });
    const qr = pi.next_action?.promptpay_display_qr_code;
    if (!qr) throw new Error('Stripe ไม่ได้ส่ง QR กลับมา');
    const payment = {
      id: pi.id,
      planId: plan.id,
      amount,
      qr: qr.image_url_svg,
      testUrl: process.env.STRIPE_SECRET_KEY!.trim().startsWith('sk_test_') ? qr.data : null,
    };
    await savePromptPay(user.id, payment, couponCode);
    return Response.json({ ...payment, status: 'pending', createdAt: Date.now() });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'สร้าง QR ไม่สำเร็จ', { status: 502 });
  }
}
