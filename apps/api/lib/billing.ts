import { db } from '@longrak/db';
import type { Coupon, Subscription } from '@longrak/shared/api-types';

export type { Coupon, Subscription };
import { FREE_PLAN_ID, type Plan, type PlanFeatures } from '@longrak/shared/plans';

type PlanRow = { id: string; name: string; level: number; price: number; interval: string; active: boolean; features: PlanFeatures; perks: string[] };

function toPlan(r: PlanRow): Plan {
  return { ...r, interval: r.interval === 'year' ? 'year' : 'month' };
}

export async function listPlans(): Promise<Plan[]> {
  const sql = await db();
  return (await sql<PlanRow[]>`SELECT * FROM plans ORDER BY level, price`).map(toPlan);
}

export async function getPlan(id: string): Promise<Plan | null> {
  const sql = await db();
  const [row] = await sql<PlanRow[]>`SELECT * FROM plans WHERE id = ${id}`;
  return row ? toPlan(row) : null;
}


export async function getSubscription(userId: number): Promise<Subscription | null> {
  const sql = await db();
  const [r] = await sql<
    { plan_id: string; source: Subscription['source']; status: string; current_period_end: number; cancel_at_period_end: boolean; stripe_subscription_id: string | null }[]
  >`SELECT * FROM subscriptions WHERE user_id = ${userId}`;
  return r
    ? {
        planId: r.plan_id,
        source: r.source,
        status: r.status,
        currentPeriodEnd: r.current_period_end,
        cancelAtPeriodEnd: r.cancel_at_period_end,
        stripeSubscriptionId: r.stripe_subscription_id,
      }
    : null;
}

/** Card payments can arrive a little after the period ends; keep access for a day while Stripe retries. */
const STRIPE_GRACE_MS = 86_400_000;

export function isLive(sub: Subscription | null, now = Date.now()) {
  if (!sub) return false;
  if (sub.source === 'stripe') {
    return ['active', 'trialing', 'past_due'].includes(sub.status) && sub.currentPeriodEnd + STRIPE_GRACE_MS > now;
  }
  return sub.status === 'active' && sub.currentPeriodEnd > now;
}

/** The plan an account is on right now: its live membership, or the free plan. */
export async function effectivePlan(userId: number): Promise<Plan> {
  const sub = await getSubscription(userId);
  const plan = sub && isLive(sub) ? await getPlan(sub.planId) : null;
  return plan ?? (await getPlan(FREE_PLAN_ID))!;
}

export async function setSubscription(userId: number, s: Subscription) {
  const sql = await db();
  await sql`
    INSERT INTO subscriptions (user_id, plan_id, source, status, current_period_end, cancel_at_period_end, stripe_subscription_id, updated_at)
    VALUES (${userId}, ${s.planId}, ${s.source}, ${s.status}, ${s.currentPeriodEnd}, ${s.cancelAtPeriodEnd}, ${s.stripeSubscriptionId}, ${Date.now()})
    ON CONFLICT (user_id) DO UPDATE SET plan_id = excluded.plan_id, source = excluded.source, status = excluded.status,
      current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
      stripe_subscription_id = excluded.stripe_subscription_id, updated_at = excluded.updated_at`;
}

/** Days are counted in Thailand, so the daily limit resets at midnight Bangkok time. */
export function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

export async function usageToday(userId: number) {
  const sql = await db();
  const [r] = await sql<{ chat: number; other: number }[]>`SELECT chat, other FROM usage WHERE user_id = ${userId} AND day = ${today()}`;
  return r ?? { chat: 0, other: 0 };
}

/**
 * Takes one unit of today's allowance before the AI call, in a single statement, so parallel
 * requests can't all pass the check and overshoot the limit. `limit` 0 means unlimited.
 * Returns false when the allowance is used up.
 */
export async function reserveUsage(userId: number, kind: 'chat' | 'other', limit: number): Promise<boolean> {
  const sql = await db();
  const day = today();
  const rows =
    kind === 'chat'
      ? await sql`
          INSERT INTO usage (user_id, day, chat) VALUES (${userId}, ${day}, 1)
          ON CONFLICT (user_id, day) DO UPDATE SET chat = usage.chat + 1
          WHERE ${limit} = 0 OR usage.chat < ${limit}
          RETURNING chat`
      : await sql`
          INSERT INTO usage (user_id, day, other) VALUES (${userId}, ${day}, 1)
          ON CONFLICT (user_id, day) DO UPDATE SET other = usage.other + 1
          WHERE ${limit} = 0 OR usage.other < ${limit}
          RETURNING other`;
  return rows.length > 0;
}

/** Gives the unit back when the AI call failed, so errors don't eat the allowance. */
export async function releaseUsage(userId: number, kind: 'chat' | 'other') {
  const sql = await db();
  if (kind === 'chat') await sql`UPDATE usage SET chat = greatest(chat - 1, 0) WHERE user_id = ${userId} AND day = ${today()}`;
  else await sql`UPDATE usage SET other = greatest(other - 1, 0) WHERE user_id = ${userId} AND day = ${today()}`;
}

// ---------- coupons ----------


type CouponRow = {
  code: string;
  kind: Coupon['kind'];
  value: number;
  duration: Coupon['duration'];
  plan_ids: string[] | null;
  max_redemptions: number | null;
  expires_at: number | null;
  active: boolean;
  note: string;
  stripe_coupon_id: string | null;
  created_at: number;
  redemptions: number;
};


function toCoupon(r: CouponRow): Coupon {
  return {
    code: r.code,
    kind: r.kind,
    value: r.value,
    duration: r.duration,
    planIds: r.plan_ids,
    maxRedemptions: r.max_redemptions,
    expiresAt: r.expires_at,
    active: r.active,
    note: r.note,
    stripeCouponId: r.stripe_coupon_id,
    createdAt: r.created_at,
    redemptions: r.redemptions,
  };
}

export async function listCoupons(): Promise<Coupon[]> {
  const sql = await db();
  const rows = await sql<CouponRow[]>`
    SELECT c.*, (SELECT count(*) FROM coupon_redemptions r WHERE r.code = c.code) AS redemptions
    FROM coupons c ORDER BY c.created_at DESC`;
  return rows.map(toCoupon);
}

export async function getCoupon(code: string): Promise<Coupon | null> {
  const sql = await db();
  const [r] = await sql<CouponRow[]>`
    SELECT c.*, (SELECT count(*) FROM coupon_redemptions r WHERE r.code = c.code) AS redemptions
    FROM coupons c WHERE c.code = ${code.trim()}`;
  return r ? toCoupon(r) : null;
}

/** Why this account can't use the code on this plan, or null when it can. */
export async function couponProblem(c: Coupon | null, userId: number, planId: string | null): Promise<string | null> {
  if (!c || !c.active) return 'ไม่พบโค้ดนี้ หรือโค้ดถูกปิดใช้แล้ว';
  if (c.expiresAt && c.expiresAt < Date.now()) return 'โค้ดนี้หมดอายุแล้ว';
  const sql = await db();
  const [used] = await sql`SELECT 1 FROM coupon_redemptions WHERE code = ${c.code} AND user_id = ${userId}`;
  if (used) return 'บัญชีนี้ใช้โค้ดนี้ไปแล้ว';
  if (c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions) return 'โค้ดนี้มีคนใช้ครบจำนวนแล้ว';
  if (planId && c.planIds && !c.planIds.includes(planId)) return 'โค้ดนี้ใช้กับแพ็กเกจนี้ไม่ได้';
  return null;
}

export async function recordRedemption(code: string, userId: number) {
  const sql = await db();
  await sql`INSERT INTO coupon_redemptions (code, user_id, at) VALUES (${code}, ${userId}, ${Date.now()}) ON CONFLICT DO NOTHING`;
}

/** Price of the first period after the code. */
export function discounted(price: number, c: Coupon | null) {
  if (!c) return price;
  if (c.kind === 'percent') return Math.max(0, Math.round(price * (1 - c.value / 100)));
  if (c.kind === 'amount') return Math.max(0, price - c.value);
  return price;
}
