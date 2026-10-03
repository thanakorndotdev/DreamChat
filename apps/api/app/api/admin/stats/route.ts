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

/** "YYYY-MM" of the Bangkok month `back` months before the one `today` ("YYYY-MM-DD") is in. */
const monthBack = (today: string, back: number) => {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 7);
};
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const bkkMonth = (col: string) => `to_char(to_timestamp(${col} / 1000.0) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM')`;
const bkkDate = (col: string) => `(to_timestamp(${col} / 1000.0) AT TIME ZONE 'Asia/Bangkok')::date`;
const WEEKDAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

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
    // "paid" = redeemed, then paid money at some point afterwards: the code brought in a paying customer.
    sql<{ code: string; redemptions: number; paid: number }[]>`
      SELECT r.code::text, count(*) AS redemptions,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM payments p WHERE p.user_id = r.user_id AND p.amount > 0 AND p.at >= r.at)) AS paid
      FROM coupon_redemptions r GROUP BY r.code ORDER BY redemptions DESC LIMIT 10`,
    sql<{ revenue30: number; prev30: number; all: number; refunds: number; pending: number; payers30: number }[]>`
      SELECT coalesce(sum(amount) FILTER (WHERE at > ${now - 30 * DAY}), 0)::int AS revenue30,
        count(DISTINCT user_id) FILTER (WHERE amount > 0 AND at > ${now - 30 * DAY}) AS payers30,
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

  const today = days30[29];
  const months12 = Array.from({ length: 12 }, (_, i) => monthBack(today, 11 - i));
  const since12 = Date.parse(`${months12[0]}-01T00:00:00+07:00`);
  const cohortSince = Date.parse(`${addDays(today, -62)}T00:00:00+07:00`);
  const [monthMoney, monthSignups, monthNewPayers, [newPayers], [funnel], cohortRows, weekdayUsage, weekdaySignups] = await Promise.all([
    sql.unsafe<{ month: string; membership: number; tokens: number; refunds: number; payers: number }[]>(
      `SELECT ${bkkMonth('at')} AS month,
        coalesce(sum(amount) FILTER (WHERE kind IN ('subscription', 'promptpay')), 0)::int AS membership,
        coalesce(sum(amount) FILTER (WHERE kind = 'tokens'), 0)::int AS tokens,
        coalesce(-sum(amount) FILTER (WHERE kind = 'refund'), 0)::int AS refunds,
        count(DISTINCT user_id) FILTER (WHERE amount > 0)::int AS payers
      FROM payments WHERE at >= $1 GROUP BY 1`,
      [since12],
    ),
    sql.unsafe<{ month: string; n: number }[]>(`SELECT ${bkkMonth('created_at')} AS month, count(*)::int AS n FROM users WHERE created_at >= $1 GROUP BY 1`, [since12]),
    // A customer's first payment ever, by month: new paying customers.
    sql.unsafe<{ month: string; n: number }[]>(
      `SELECT ${bkkMonth('first')} AS month, count(*)::int AS n
      FROM (SELECT min(at) AS first FROM payments WHERE amount > 0 AND user_id IS NOT NULL GROUP BY user_id) f
      WHERE first >= $1 GROUP BY 1`,
      [since12],
    ),
    sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (SELECT min(at) AS first FROM payments WHERE amount > 0 AND user_id IS NOT NULL GROUP BY user_id) f
      WHERE first > ${now - 30 * DAY}`,
    // Everyone who signed up in the last 30 days, and how far they got.
    sql<{ signed_up: number; consented: number; chatted: number; returned: number; paid: number }[]>`
      SELECT count(*)::int AS signed_up,
        count(*) FILTER (WHERE u.consent_version >= ${CONSENT_VERSION})::int AS consented,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM usage x WHERE x.user_id = u.id AND x.chat > 0))::int AS chatted,
        count(*) FILTER (WHERE (SELECT count(*) FROM usage x WHERE x.user_id = u.id AND x.chat > 0) >= 2)::int AS returned,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.amount > 0))::int AS paid
      FROM users u WHERE u.created_at > ${now - 30 * DAY}`,
    // Weekly sign-up cohorts (weeks start Monday): who came back to chat the next day, in their second week, and a month on.
    sql.unsafe<{ week: string; size: number; d1: number; d7: number; d30: number }[]>(
      `WITH s AS (SELECT id, ${bkkDate('created_at')} AS d FROM users WHERE created_at >= $1)
      SELECT to_char(date_trunc('week', s.d), 'YYYY-MM-DD') AS week, count(*)::int AS size,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM usage x WHERE x.user_id = s.id AND x.chat > 0 AND x.day::date = s.d + 1))::int AS d1,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM usage x WHERE x.user_id = s.id AND x.chat > 0 AND x.day::date BETWEEN s.d + 7 AND s.d + 13))::int AS d7,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM usage x WHERE x.user_id = s.id AND x.chat > 0 AND x.day::date BETWEEN s.d + 28 AND s.d + 34))::int AS d30
      FROM s GROUP BY 1 ORDER BY 1`,
      [cohortSince],
    ),
    sql<{ dow: number; messages: number; chatters: number }[]>`
      SELECT extract(isodow FROM day::date)::int AS dow, coalesce(sum(chat), 0)::int AS messages, count(*) FILTER (WHERE chat > 0)::int AS chatters
      FROM usage WHERE day > ${addDays(today, -91)} AND day <= ${today} GROUP BY 1`,
    sql.unsafe<{ dow: number; n: number }[]>(
      `SELECT extract(isodow FROM ${bkkDate('created_at')})::int AS dow, count(*)::int AS n FROM users WHERE created_at > $1 GROUP BY 1`,
      [now - 91 * DAY],
    ),
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

  // Paid memberships that ran out in the last 30 days without renewing, and live ones set not to renew.
  const lapsed30 = subs.filter(
    (s) => (s.source === 'stripe' || s.source === 'promptpay') && s.current_period_end > now - 30 * DAY && s.current_period_end <= now && !live.includes(s),
  ).length;
  const cancelling = live.filter((s) => paidSource(s) && s.cancel_at_period_end).length;

  const byMonth = new Map(monthMoney.map((r) => [r.month, r]));
  const signupsByMonth = new Map(monthSignups.map((r) => [r.month, r.n]));
  const newPayersByMonth = new Map(monthNewPayers.map((r) => [r.month, r.n]));
  const months = months12.map((month) => {
    const r = byMonth.get(month);
    return {
      month,
      membership: r?.membership ?? 0,
      tokens: r?.tokens ?? 0,
      refunds: r?.refunds ?? 0,
      net: (r?.membership ?? 0) + (r?.tokens ?? 0) - (r?.refunds ?? 0),
      payers: r?.payers ?? 0,
      newPayers: newPayersByMonth.get(month) ?? 0,
      signups: signupsByMonth.get(month) ?? 0,
    };
  });

  // A figure is only shown once every member of the cohort has had the chance to reach it.
  const cohorts = cohortRows.slice(-8).map((r) => {
    const lastSignup = addDays(r.week, 6);
    const ready = (n: number) => addDays(lastSignup, n) < today;
    return { week: r.week, size: r.size, d1: ready(1) ? r.d1 : null, d7: ready(13) ? r.d7 : null, d30: ready(34) ? r.d30 : null };
  });

  const usageByDow = new Map(weekdayUsage.map((r) => [r.dow, r]));
  const signupsByDow = new Map(weekdaySignups.map((r) => [r.dow, r.n]));
  const weekdays = WEEKDAYS.map((label, i) => ({
    label,
    messages: usageByDow.get(i + 1)?.messages ?? 0,
    chatters: usageByDow.get(i + 1)?.chatters ?? 0,
    signups: signupsByDow.get(i + 1) ?? 0,
  }));

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
    funnel: { signedUp: funnel.signed_up, consented: funnel.consented, chatted: funnel.chatted, returned: funnel.returned, paid: funnel.paid },
    cohorts,
    weekdays,
    months,
    money: {
      revenue30: money.revenue30,
      revenuePrev30: money.prev30,
      revenueAll: money.all,
      refundsAll: money.refunds,
      byKind30: byKind,
      mrr,
      payingMembers: live.filter(paidSource).length,
      pendingPromptPay: money.pending,
      payers30: money.payers30,
      newPayers30: newPayers.n,
      lapsed30,
      cancelling,
    },
    tokens: { outstanding: tokens.outstanding, bought30: tokens.bought, checkin30: tokens.checkin, spentMessages30: tokens.messages, spentUnlocks30: tokens.unlocks, admin30: tokens.admin },
    days,
  };
  return Response.json(stats);
}
