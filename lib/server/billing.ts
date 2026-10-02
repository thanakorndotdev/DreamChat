import { getDb } from './db';
import { FREE_PLAN_ID, type Plan, type PlanFeatures } from '../plans';

type PlanRow = { id: string; name: string; level: number; price: number; interval: string; active: number; features: string; perks: string };

function toPlan(r: PlanRow): Plan {
  return {
    id: r.id,
    name: r.name,
    level: r.level,
    price: r.price,
    interval: r.interval === 'year' ? 'year' : 'month',
    active: !!r.active,
    features: JSON.parse(r.features) as PlanFeatures,
    perks: JSON.parse(r.perks) as string[],
  };
}

export function listPlans(): Plan[] {
  return (getDb().prepare('SELECT * FROM plans ORDER BY level, price').all() as PlanRow[]).map(toPlan);
}

export function getPlan(id: string): Plan | null {
  const row = getDb().prepare('SELECT * FROM plans WHERE id = ?').get(id) as PlanRow | undefined;
  return row ? toPlan(row) : null;
}

export type Subscription = {
  planId: string;
  source: 'stripe' | 'code' | 'admin';
  status: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
};

export function getSubscription(userId: number): Subscription | null {
  const r = getDb().prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as
    | { plan_id: string; source: Subscription['source']; status: string; current_period_end: number; cancel_at_period_end: number; stripe_subscription_id: string | null }
    | undefined;
  return r
    ? {
        planId: r.plan_id,
        source: r.source,
        status: r.status,
        currentPeriodEnd: r.current_period_end,
        cancelAtPeriodEnd: !!r.cancel_at_period_end,
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
export function effectivePlan(userId: number): Plan {
  const sub = getSubscription(userId);
  const plan = isLive(sub) ? getPlan(sub!.planId) : null;
  return plan ?? getPlan(FREE_PLAN_ID)!;
}

export function setSubscription(userId: number, s: Subscription) {
  getDb()
    .prepare(
      `INSERT INTO subscriptions (user_id, plan_id, source, status, current_period_end, cancel_at_period_end, stripe_subscription_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET plan_id = excluded.plan_id, source = excluded.source, status = excluded.status,
         current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
         stripe_subscription_id = excluded.stripe_subscription_id, updated_at = excluded.updated_at`,
    )
    .run(userId, s.planId, s.source, s.status, s.currentPeriodEnd, s.cancelAtPeriodEnd ? 1 : 0, s.stripeSubscriptionId, Date.now());
}

/** Days are counted in Thailand, so the daily limit resets at midnight Bangkok time. */
export function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

export function usageToday(userId: number) {
  const r = getDb().prepare('SELECT chat, other FROM usage WHERE user_id = ? AND day = ?').get(userId, today()) as
    | { chat: number; other: number }
    | undefined;
  return r ?? { chat: 0, other: 0 };
}

export function countUsage(userId: number, kind: 'chat' | 'other') {
  getDb()
    .prepare(`INSERT INTO usage (user_id, day, ${kind}) VALUES (?, ?, 1) ON CONFLICT (user_id, day) DO UPDATE SET ${kind} = ${kind} + 1`)
    .run(userId, today());
}

// ---------- coupons ----------

export type Coupon = {
  code: string;
  kind: 'percent' | 'amount' | 'free_days';
  value: number;
  duration: 'once' | 'forever';
  planIds: string[] | null;
  maxRedemptions: number | null;
  expiresAt: number | null;
  active: boolean;
  note: string;
  stripeCouponId: string | null;
  createdAt: number;
  redemptions: number;
};

type CouponRow = {
  code: string;
  kind: Coupon['kind'];
  value: number;
  duration: Coupon['duration'];
  plan_ids: string | null;
  max_redemptions: number | null;
  expires_at: number | null;
  active: number;
  note: string;
  stripe_coupon_id: string | null;
  created_at: number;
  redemptions: number;
};

const COUPON_SELECT = `SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.code = c.code) AS redemptions FROM coupons c`;

function toCoupon(r: CouponRow): Coupon {
  return {
    code: r.code,
    kind: r.kind,
    value: r.value,
    duration: r.duration,
    planIds: r.plan_ids ? (JSON.parse(r.plan_ids) as string[]) : null,
    maxRedemptions: r.max_redemptions,
    expiresAt: r.expires_at,
    active: !!r.active,
    note: r.note,
    stripeCouponId: r.stripe_coupon_id,
    createdAt: r.created_at,
    redemptions: r.redemptions,
  };
}

export function listCoupons(): Coupon[] {
  return (getDb().prepare(`${COUPON_SELECT} ORDER BY c.created_at DESC`).all() as CouponRow[]).map(toCoupon);
}

export function getCoupon(code: string): Coupon | null {
  const r = getDb().prepare(`${COUPON_SELECT} WHERE c.code = ?`).get(code.trim()) as CouponRow | undefined;
  return r ? toCoupon(r) : null;
}

/** Why this account can't use the code on this plan, or null when it can. */
export function couponProblem(c: Coupon | null, userId: number, planId: string | null): string | null {
  if (!c || !c.active) return 'ไม่พบโค้ดนี้ หรือโค้ดถูกปิดใช้แล้ว';
  if (c.expiresAt && c.expiresAt < Date.now()) return 'โค้ดนี้หมดอายุแล้ว';
  if (getDb().prepare('SELECT 1 FROM coupon_redemptions WHERE code = ? AND user_id = ?').get(c.code, userId)) return 'บัญชีนี้ใช้โค้ดนี้ไปแล้ว';
  if (c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions) return 'โค้ดนี้มีคนใช้ครบจำนวนแล้ว';
  if (planId && c.planIds && !c.planIds.includes(planId)) return 'โค้ดนี้ใช้กับแพ็กเกจนี้ไม่ได้';
  return null;
}

export function recordRedemption(code: string, userId: number) {
  getDb().prepare('INSERT OR IGNORE INTO coupon_redemptions (code, user_id, at) VALUES (?, ?, ?)').run(code, userId, Date.now());
}

/** Price of the first period after the code. */
export function discounted(price: number, c: Coupon | null) {
  if (!c) return price;
  if (c.kind === 'percent') return Math.max(0, Math.round(price * (1 - c.value / 100)));
  if (c.kind === 'amount') return Math.max(0, price - c.value);
  return price;
}
