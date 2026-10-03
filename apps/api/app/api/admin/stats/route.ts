import { requireAdmin } from '@/lib/auth';
import { isLive, listPlans } from '@/lib/billing';
import type { AdminStats, StatsDay } from '@longrak/shared/api-types';
import { ageFromBirthdate } from '@longrak/shared/age';
import { CONSENT_VERSION } from '@longrak/shared/legal';
import { db } from '@longrak/db';

const DAY = 86_400_000;
/** Bangkok calendar day of a ms timestamp column, matching usage.day. */
const bkk = (col: string) => `to_char(to_timestamp(${col} / 1000.0) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')`;
const dayOf = (ts: number) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

const AGE_BANDS: [string, number, number][] = [
  ['ต่ำกว่า 18', 0, 17],
  ['18–24', 18, 24],
  ['25–34', 25, 34],
  ['35–44', 35, 44],
  ['45 ขึ้นไป', 45, 200],
];

/** Everything on the admin's overview in one call. Aggregates only. */
export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const sql = await db();
  const now = Date.now();
  const days30 = Array.from({ length: 30 }, (_, i) => dayOf(now - (29 - i) * DAY));
  const [d1, d7, d30] = [days30[29], days30[23], days30[0]];

  const [
    [u],
    births,
    chatters,
    subs,
    plans,
    [chars],
    catalog,
    coupons,
    [money],
    byKind,
    [tokens],
    signupDays,
    usageDays,
    revenueDays,
  ] = await Promise.all([
    sql<{ total: number; new7: number; new30: number; seen7: number; marketing: number; consented: number }[]>`
      SELECT count(*) AS total,
        count(*) FILTER (WHERE created_at > ${now - 7 * DAY}) AS new7,
        count(*) FILTER (WHERE created_at > ${now - 30 * DAY}) AS new30,
        count(*) FILTER (WHERE last_seen_at > ${now - 7 * DAY}) AS seen7,
        count(*) FILTER (WHERE marketing_consent) AS marketing,
        count(*) FILTER (WHERE consent_version >= ${CONSENT_VERSION}) AS consented
      FROM users`,
    sql<{ birthdate: string | null }[]>`SELECT birthdate FROM users`,
    sql<{ c1: number; c7: number; c30: number; msgs30: number }[]>`
      SELECT count(DISTINCT user_id) FILTER (WHERE day >= ${d1} AND chat > 0) AS c1,
        count(DISTINCT user_id) FILTER (WHERE day >= ${d7} AND chat > 0) AS c7,
        count(DISTINCT user_id) FILTER (WHERE day >= ${d30} AND chat > 0) AS c30,
        coalesce(sum(chat) FILTER (WHERE day >= ${d30}), 0)::int AS msgs30
      FROM usage`,
    sql<{ plan_id: string; source: 'stripe' | 'code' | 'admin' | 'promptpay'; status: string; current_period_end: number; cancel_at_period_end: boolean }[]>`
      SELECT plan_id, source, status, current_period_end, cancel_at_period_end FROM subscriptions`,
    listPlans(),
    sql<{ own: number; from_catalog: number; published: number; pending: number }[]>`
      SELECT count(*) FILTER (WHERE data->>'sourceId' IS NULL) AS own,
        count(*) FILTER (WHERE data->>'sourceId' IS NOT NULL) AS from_catalog,
        (SELECT count(*) FROM catalog WHERE status = 'published') AS published,
        (SELECT count(*) FROM catalog WHERE status = 'pending') AS pending
      FROM characters`,
    // A catalog chat's id is cat-<catalog id>-<time>; usage and unlocks count per cat:<catalog id>.
    sql<{ id: string; name: string | null; chats: number; messages: number; unlocks: number }[]>`
      SELECT c.id, c.data->>'name' AS name,
        (SELECT count(*) FROM characters ch WHERE ch.data->>'sourceId' = c.id) AS chats,
        (SELECT coalesce(sum(free_used + paid), 0)::int FROM character_usage cu WHERE cu.char_key = 'cat:' || c.id) AS messages,
        (SELECT count(*) FROM character_unlocks ul WHERE ul.char_key = 'cat:' || c.id) AS unlocks
      FROM catalog c WHERE c.status = 'published'
      ORDER BY messages DESC, chats DESC LIMIT 10`,
    sql<{ code: string; redemptions: number }[]>`
      SELECT code::text, count(*) AS redemptions FROM coupon_redemptions GROUP BY code ORDER BY redemptions DESC LIMIT 10`,
    sql<{ revenue30: number; prev30: number; all: number; refunds: number; pending: number }[]>`
      SELECT coalesce(sum(amount) FILTER (WHERE at > ${now - 30 * DAY}), 0)::int AS revenue30,
        coalesce(sum(amount) FILTER (WHERE at > ${now - 60 * DAY} AND at <= ${now - 30 * DAY}), 0)::int AS prev30,
        coalesce(sum(amount), 0)::int AS all,
        coalesce(-sum(amount) FILTER (WHERE kind = 'refund'), 0)::int AS refunds,
        (SELECT count(*) FROM promptpay_payments WHERE status = 'pending' AND created_at > ${now - DAY}) AS pending
      FROM payments`,
    sql<{ kind: string; amount: number; count: number }[]>`
      SELECT kind, sum(amount)::int AS amount, count(*) AS count FROM payments WHERE at > ${now - 30 * DAY} GROUP BY kind ORDER BY amount DESC`,
    sql<{ outstanding: number; bought: number; checkin: number; messages: number; unlocks: number; admin: number }[]>`
      SELECT (SELECT coalesce(sum(tokens), 0)::int FROM users) AS outstanding,
        coalesce(sum(delta) FILTER (WHERE reason = 'purchase'), 0)::int AS bought,
        coalesce(sum(delta) FILTER (WHERE reason = 'checkin'), 0)::int AS checkin,
        coalesce(-sum(delta) FILTER (WHERE reason IN ('message', 'refund')), 0)::int AS messages,
        coalesce(-sum(delta) FILTER (WHERE reason = 'unlock'), 0)::int AS unlocks,
        coalesce(sum(delta) FILTER (WHERE reason = 'admin'), 0)::int AS admin
      FROM token_ledger WHERE at > ${now - 30 * DAY}`,
    sql.unsafe<{ day: string; n: number }[]>(`SELECT ${bkk('created_at')} AS day, count(*)::int AS n FROM users WHERE created_at > $1 GROUP BY 1`, [now - 31 * DAY]),
    sql<{ day: string; chatters: number; messages: number }[]>`
      SELECT day, count(DISTINCT user_id) FILTER (WHERE chat > 0)::int AS chatters, sum(chat)::int AS messages FROM usage WHERE day >= ${d30} GROUP BY day`,
    sql.unsafe<{ day: string; amount: number }[]>(`SELECT ${bkk('at')} AS day, sum(amount)::int AS amount FROM payments WHERE at > $1 GROUP BY 1`, [now - 31 * DAY]),
  ]);

  const live = subs.filter((s) => isLive({ planId: s.plan_id, source: s.source, status: s.status, currentPeriodEnd: s.current_period_end, cancelAtPeriodEnd: s.cancel_at_period_end, stripeSubscriptionId: null }, now));
  const paidSource = (s: (typeof live)[number]) => s.source === 'stripe' || s.source === 'promptpay';
  const planById = new Map(plans.map((p) => [p.id, p]));
  const mrr = live
    .filter((s) => s.source === 'stripe' && !s.cancel_at_period_end)
    .reduce((sum, s) => {
      const p = planById.get(s.plan_id);
      return sum + (p ? Math.round(p.interval === 'year' ? p.price / 12 : p.price) : 0);
    }, 0);

  const ages = AGE_BANDS.map(([label, lo, hi]) => ({
    label,
    count: births.filter((b) => {
      const a = ageFromBirthdate(b.birthdate);
      return a !== null && a >= lo && a <= hi;
    }).length,
  }));
  ages.push({ label: 'ยังไม่ระบุ', count: births.filter((b) => ageFromBirthdate(b.birthdate) === null).length });

  const signups = new Map(signupDays.map((r) => [r.day, r.n]));
  const usage = new Map(usageDays.map((r) => [r.day, r]));
  const revenue = new Map(revenueDays.map((r) => [r.day, r.amount]));
  const days: StatsDay[] = days30.map((day) => ({
    day,
    signups: signups.get(day) ?? 0,
    activeChatters: usage.get(day)?.chatters ?? 0,
    messages: usage.get(day)?.messages ?? 0,
    revenue: revenue.get(day) ?? 0,
  }));

  const [c] = chatters;
  const stats: AdminStats = {
    generatedAt: now,
    users: {
      total: u.total,
      new7: u.new7,
      new30: u.new30,
      chatters1: c.c1,
      chatters7: c.c7,
      chatters30: c.c30,
      seen7: u.seen7,
      marketingOptIn: u.marketing,
      consented: u.consented,
      ages,
    },
    plans: plans
      .filter((p) => p.price > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        interval: p.interval,
        paying: live.filter((s) => s.plan_id === p.id && paidSource(s)).length,
        free: live.filter((s) => s.plan_id === p.id && !paidSource(s)).length,
      })),
    messagesPerChatter30: c.c30 ? Math.round((c.msgs30 / c.c30) * 10) / 10 : 0,
    characters: { own: chars.own, fromCatalog: chars.from_catalog, catalogPublished: chars.published, catalogPending: chars.pending },
    topCatalog: catalog.map((r) => ({ id: r.id, name: r.name ?? r.id, chats: r.chats, messages: r.messages, unlocks: r.unlocks })),
    coupons,
    money: {
      revenue30: money.revenue30,
      revenuePrev30: money.prev30,
      revenueAll: money.all,
      refundsAll: money.refunds,
      byKind30: byKind,
      mrr,
      payingMembers: live.filter(paidSource).length,
      pendingPromptPay: money.pending,
    },
    tokens: { outstanding: tokens.outstanding, bought30: tokens.bought, checkin30: tokens.checkin, spentMessages30: tokens.messages, spentUnlocks30: tokens.unlocks, admin30: tokens.admin },
    days,
  };
  return Response.json(stats);
}
