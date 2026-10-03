import { db } from '@longrak/db';
import { recordPayment } from '@/lib/payments';
import { getPlan } from '@/lib/billing';
import { stripe } from '@/lib/stripe';

/** A PromptPay payment adds one plan period; there's no renewal, so the next one is paid the same way. */
const PERIOD_MS = { month: 30 * 86_400_000, year: 365 * 86_400_000 } as const;

export type PromptPayPayment = {
  id: string;
  planId: string;
  amount: number;
  status: 'pending' | 'paid' | 'canceled';
  qr: string;
  testUrl: string | null;
  createdAt: number;
};

type Row = { id: string; plan_id: string; amount: number; status: PromptPayPayment['status']; qr: string; test_url: string | null; created_at: number };

const toPayment = (r: Row): PromptPayPayment => ({
  id: r.id,
  planId: r.plan_id,
  amount: r.amount,
  status: r.status,
  qr: r.qr,
  testUrl: r.test_url,
  createdAt: r.created_at,
});

export async function getPromptPay(id: string, userId: number): Promise<PromptPayPayment | null> {
  const sql = await db();
  const [r] = await sql<Row[]>`SELECT * FROM promptpay_payments WHERE id = ${id} AND user_id = ${userId}`;
  return r ? toPayment(r) : null;
}

/** An unpaid QR for the same plan and price made in the last 30 minutes, so a reload doesn't make another. */
export async function openPromptPay(userId: number, planId: string, amount: number): Promise<PromptPayPayment | null> {
  const sql = await db();
  const [r] = await sql<Row[]>`
    SELECT * FROM promptpay_payments
    WHERE user_id = ${userId} AND plan_id = ${planId} AND amount = ${amount} AND status = 'pending' AND created_at > ${Date.now() - 30 * 60_000}
    ORDER BY created_at DESC LIMIT 1`;
  return r ? toPayment(r) : null;
}

export async function savePromptPay(userId: number, p: Omit<PromptPayPayment, 'status' | 'createdAt'>, code: string | null) {
  const sql = await db();
  await sql`
    INSERT INTO promptpay_payments (id, user_id, plan_id, code, amount, status, qr, test_url, created_at)
    VALUES (${p.id}, ${userId}, ${p.planId}, ${code}, ${p.amount}, 'pending', ${p.qr}, ${p.testUrl}, ${Date.now()})`;
}

/**
 * Marks the payment paid and extends the membership, once: the webhook and the page's polling can
 * both get here, and only the first one to flip the row from pending does the granting.
 */
export async function grantPromptPay(id: string) {
  const sql = await db();
  await sql.begin(async (tx) => {
    const [p] = await tx<{ user_id: number; plan_id: string; code: string | null; amount: number }[]>`
      UPDATE promptpay_payments SET status = 'paid', paid_at = ${Date.now()}
      WHERE id = ${id} AND status <> 'paid' RETURNING user_id, plan_id, code, amount`;
    if (!p) return;
    await recordPayment({ id, userId: p.user_id, kind: 'promptpay', planId: p.plan_id, amount: p.amount }, tx);
    const plan = await getPlan(p.plan_id);
    if (!plan) throw new Error(`plan ${p.plan_id} is gone`);

    const [sub] = await tx<{ plan_id: string; source: string; status: string; current_period_end: number }[]>`
      SELECT plan_id, source, status, current_period_end FROM subscriptions WHERE user_id = ${p.user_id} FOR UPDATE`;
    // Same plan stacks on top of the days left; a different plan starts now, like a free-days code.
    const stacks = sub && sub.source !== 'stripe' && sub.status === 'active' && sub.plan_id === plan.id && sub.current_period_end > Date.now();
    const until = (stacks ? sub.current_period_end : Date.now()) + PERIOD_MS[plan.interval];
    await tx`
      INSERT INTO subscriptions (user_id, plan_id, source, status, current_period_end, cancel_at_period_end, stripe_subscription_id, updated_at)
      VALUES (${p.user_id}, ${plan.id}, 'promptpay', 'active', ${until}, true, null, ${Date.now()})
      ON CONFLICT (user_id) DO UPDATE SET plan_id = excluded.plan_id, source = excluded.source, status = excluded.status,
        current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
        stripe_subscription_id = null, updated_at = excluded.updated_at`;
    if (p.code) await tx`INSERT INTO coupon_redemptions (code, user_id, at) VALUES (${p.code}, ${p.user_id}, ${Date.now()}) ON CONFLICT DO NOTHING`;
  });
}

export async function cancelPromptPay(id: string) {
  const sql = await db();
  await sql`UPDATE promptpay_payments SET status = 'canceled' WHERE id = ${id} AND status = 'pending'`;
}

/** Asks Stripe where a pending payment stands and records the answer, for when the webhook is late or missing. */
export async function syncPromptPay(p: PromptPayPayment): Promise<PromptPayPayment['status']> {
  if (p.status !== 'pending') return p.status;
  const pi = await stripe<{ status: string }>('GET', `payment_intents/${p.id}`);
  if (pi.status === 'succeeded') {
    await grantPromptPay(p.id);
    return 'paid';
  }
  if (pi.status === 'canceled' || pi.status === 'requires_payment_method') {
    await cancelPromptPay(p.id);
    return 'canceled';
  }
  return 'pending';
}
