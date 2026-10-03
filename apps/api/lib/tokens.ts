import { db } from '@longrak/db';
import type { Plan } from '@longrak/shared/plans';
import { type CharacterAccess, DEFAULT_ECONOMY, type Economy, type Paywall, type TokenPack } from '@longrak/shared/tokens';
import { today } from '@/lib/billing';

const ECONOMY_KEY = 'economy';
const int = (v: unknown, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(v) || 0)));

/** Prices from the admin's Tokens tab, or the defaults. */
export async function getEconomy(): Promise<Economy> {
  const sql = await db();
  const [row] = await sql<{ value: string }[]>`SELECT value FROM settings WHERE key = ${ECONOMY_KEY}`;
  if (!row) return DEFAULT_ECONOMY;
  try {
    return { ...DEFAULT_ECONOMY, ...(JSON.parse(row.value) as Partial<Economy>) };
  } catch {
    return DEFAULT_ECONOMY;
  }
}

/** Cleans what the admin sent; a message instead when a pack is unusable (Stripe charges at least ฿10). */
export function parseEconomy(raw: unknown): Economy | string {
  const b = (raw ?? {}) as Partial<Record<keyof Economy, unknown>>;
  const packs: TokenPack[] = [];
  for (const p of Array.isArray(b.packs) ? b.packs : []) {
    const { id, tokens, price } = (p ?? {}) as Record<string, unknown>;
    const pack = { id: typeof id === 'string' && /^[a-z0-9-]{1,24}$/.test(id) ? id : `p${Date.now().toString(36)}${packs.length}`, tokens: int(tokens, 0, 10_000_000), price: int(price, 0, 100_000_000) };
    if (pack.tokens < 1) return 'แพ็กโทเคนต้องมีอย่างน้อย 1 โทเคน';
    if (pack.price < 1000) return 'ราคาแพ็กโทเคนต้องอย่างน้อย ฿10';
    if (packs.some((x) => x.id === pack.id)) return 'รหัสแพ็กซ้ำกัน';
    packs.push(pack);
  }
  return { messageCost: int(b.messageCost, 0, 100_000), unlockPrice: int(b.unlockPrice, 0, 10_000_000), packs };
}

export async function setEconomy(e: Economy) {
  const sql = await db();
  await sql`INSERT INTO settings (key, value) VALUES (${ECONOMY_KEY}, ${JSON.stringify(e)}) ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
}

/**
 * Which allowance a chat counts against. A catalog chat's id is cat-<catalog id>-<time>, made only by the
 * start route, so every restart of the same catalog character shares one counter and one unlock.
 */
export function charKey(characterId: string) {
  const m = /^cat-(.+)-\d+$/.exec(characterId);
  return m ? `cat:${m[1]}` : `own:${characterId}`;
}

async function unlockPriceFor(key: string, economy: Economy) {
  if (!key.startsWith('cat:')) return economy.unlockPrice;
  const sql = await db();
  const [row] = await sql<{ unlock_price: number | null }[]>`SELECT unlock_price FROM catalog WHERE id = ${key.slice(4)}`;
  return row?.unlock_price ?? economy.unlockPrice;
}

export async function balanceOf(userId: number) {
  const sql = await db();
  const [r] = await sql<{ tokens: number }[]>`SELECT tokens FROM users WHERE id = ${userId}`;
  return r?.tokens ?? 0;
}

export async function checkedInToday(userId: number) {
  const sql = await db();
  const [r] = await sql`SELECT 1 FROM checkins WHERE user_id = ${userId} AND day = ${today()}`;
  return !!r;
}

export async function characterAccess(userId: number, characterId: string): Promise<CharacterAccess> {
  const key = charKey(characterId);
  const sql = await db();
  const [[unlocked], [usage], unlockPrice] = await Promise.all([
    sql`SELECT 1 FROM character_unlocks WHERE user_id = ${userId} AND char_key = ${key}`,
    sql<{ free_used: number }[]>`SELECT free_used FROM character_usage WHERE user_id = ${userId} AND char_key = ${key}`,
    getEconomy().then((e) => unlockPriceFor(key, e)),
  ]);
  return { unlocked: !!unlocked, freeUsed: usage?.free_used ?? 0, unlockPrice };
}

/** How one reply was paid for, so it can be given back if the AI call fails. */
export type Charge = { kind: 'unlocked' } | { kind: 'free'; key: string; day: string } | { kind: 'tokens'; key: string; cost: number };

/**
 * Pays for one reply before the AI call: an unlocked character is free; otherwise the plan's free
 * messages (today's and this character's) are used first, then tokens if the person agreed to spend them.
 * The account's row is locked for the whole decision, so parallel replies can't overspend.
 */
export async function chargeReply(userId: number, plan: Plan, characterId: string, payWithTokens: boolean): Promise<Charge | Paywall> {
  const key = charKey(characterId);
  const economy = await getEconomy();
  const unlockPrice = await unlockPriceFor(key, economy);
  const { dailyMessages, freePerCharacter } = plan.features;
  const day = today();
  const sql = await db();

  return sql.begin(async (tx): Promise<Charge | Paywall> => {
    const [{ tokens }] = await tx<{ tokens: number }[]>`SELECT tokens FROM users WHERE id = ${userId} FOR UPDATE`;
    const [unlocked] = await tx`SELECT 1 FROM character_unlocks WHERE user_id = ${userId} AND char_key = ${key}`;
    if (unlocked) return { kind: 'unlocked' };

    const [daily] = await tx<{ chat: number }[]>`SELECT chat FROM usage WHERE user_id = ${userId} AND day = ${day}`;
    const [mine] = await tx<{ free_used: number }[]>`SELECT free_used FROM character_usage WHERE user_id = ${userId} AND char_key = ${key}`;
    const dailyOk = !dailyMessages || (daily?.chat ?? 0) < dailyMessages;
    const charOk = !freePerCharacter || (mine?.free_used ?? 0) < freePerCharacter;

    if (dailyOk && charOk) {
      await tx`
        INSERT INTO usage (user_id, day, chat) VALUES (${userId}, ${day}, 1)
        ON CONFLICT (user_id, day) DO UPDATE SET chat = usage.chat + 1`;
      await tx`
        INSERT INTO character_usage (user_id, char_key, free_used) VALUES (${userId}, ${key}, 1)
        ON CONFLICT (user_id, char_key) DO UPDATE SET free_used = character_usage.free_used + 1`;
      return { kind: 'free', key, day };
    }

    const cost = economy.messageCost;
    if (!payWithTokens || tokens < cost) {
      const reason = charOk ? 'daily' : 'character';
      const ranOut = reason === 'daily' ? `วันนี้ใช้ข้อความฟรีครบ ${dailyMessages} ข้อความแล้ว` : `คุยฟรีกับตัวละครนี้ครบ ${freePerCharacter} ข้อความแล้ว`;
      const next =
        tokens < cost
          ? `ข้อความต่อไปใช้ ${cost} โทเคน แต่คุณมี ${tokens} โทเคน เติมโทเคนหรือสมัครสมาชิกเพื่อคุยต่อ`
          : `ส่งต่อได้ข้อความละ ${cost} โทเคน หรือปลดล็อกคุยไม่จำกัด ${unlockPrice.toLocaleString('th-TH')} โทเคน`;
      return { code: 'paywall', reason, cost, balance: tokens, unlockPrice, message: `${ranOut} ${next}` };
    }

    await tx`UPDATE users SET tokens = tokens - ${cost} WHERE id = ${userId}`;
    await tx`INSERT INTO token_ledger (user_id, delta, reason, ref, at) VALUES (${userId}, ${-cost}, 'message', ${key}, ${Date.now()})`;
    await tx`
      INSERT INTO character_usage (user_id, char_key, paid) VALUES (${userId}, ${key}, 1)
      ON CONFLICT (user_id, char_key) DO UPDATE SET paid = character_usage.paid + 1`;
    return { kind: 'tokens', key, cost };
  });
}

/** Gives back what a failed reply took, so errors cost nothing. */
export async function refundReply(userId: number, charge: Charge) {
  const sql = await db();
  if (charge.kind === 'free') {
    await sql.begin(async (tx) => {
      await tx`UPDATE usage SET chat = greatest(chat - 1, 0) WHERE user_id = ${userId} AND day = ${charge.day}`;
      await tx`UPDATE character_usage SET free_used = greatest(free_used - 1, 0) WHERE user_id = ${userId} AND char_key = ${charge.key}`;
    });
  } else if (charge.kind === 'tokens') {
    await sql.begin(async (tx) => {
      await tx`UPDATE users SET tokens = tokens + ${charge.cost} WHERE id = ${userId}`;
      await tx`INSERT INTO token_ledger (user_id, delta, reason, ref, at) VALUES (${userId}, ${charge.cost}, 'refund', ${charge.key}, ${Date.now()})`;
      await tx`UPDATE character_usage SET paid = greatest(paid - 1, 0) WHERE user_id = ${userId} AND char_key = ${charge.key}`;
    });
  }
}

/** Spends tokens on unlimited chat with one character. Returns the new balance, or why it couldn't. */
export async function unlockCharacter(userId: number, characterId: string): Promise<{ balance: number } | string> {
  const key = charKey(characterId);
  const price = await unlockPriceFor(key, await getEconomy());
  const sql = await db();
  return sql.begin(async (tx) => {
    const [{ tokens }] = await tx<{ tokens: number }[]>`SELECT tokens FROM users WHERE id = ${userId} FOR UPDATE`;
    const [done] = await tx`SELECT 1 FROM character_unlocks WHERE user_id = ${userId} AND char_key = ${key}`;
    if (done) return { balance: tokens };
    if (tokens < price) return `ปลดล็อกใช้ ${price.toLocaleString('th-TH')} โทเคน คุณมี ${tokens.toLocaleString('th-TH')} โทเคน`;
    await tx`UPDATE users SET tokens = tokens - ${price} WHERE id = ${userId}`;
    await tx`INSERT INTO character_unlocks (user_id, char_key, tokens, at) VALUES (${userId}, ${key}, ${price}, ${Date.now()})`;
    await tx`INSERT INTO token_ledger (user_id, delta, reason, ref, at) VALUES (${userId}, ${-price}, 'unlock', ${key}, ${Date.now()})`;
    return { balance: tokens - price };
  });
}

/** Today's check-in reward for a plan that has one. */
export async function checkIn(userId: number, plan: Plan): Promise<{ granted: number; balance: number } | string> {
  const reward = plan.features.checkinTokens;
  if (!reward) return 'เช็คอินรับโทเคนได้เฉพาะสมาชิกรายเดือน';
  const sql = await db();
  return sql.begin(async (tx) => {
    const inserted = await tx`INSERT INTO checkins (user_id, day, tokens) VALUES (${userId}, ${today()}, ${reward}) ON CONFLICT DO NOTHING RETURNING 1`;
    if (!inserted.length) return 'วันนี้เช็คอินไปแล้ว พรุ่งนี้มาใหม่นะ';
    const [{ tokens }] = await tx<{ tokens: number }[]>`UPDATE users SET tokens = tokens + ${reward} WHERE id = ${userId} RETURNING tokens`;
    await tx`INSERT INTO token_ledger (user_id, delta, reason, ref, at) VALUES (${userId}, ${reward}, 'checkin', ${today()}, ${Date.now()})`;
    return { granted: reward, balance: tokens };
  });
}

/** Credits a paid token pack once, however many times Stripe reports the payment. */
export async function creditPurchase(userId: number, tokens: number, sessionId: string) {
  const sql = await db();
  await sql.begin(async (tx) => {
    const inserted = await tx`
      INSERT INTO token_ledger (user_id, delta, reason, ref, at) VALUES (${userId}, ${tokens}, 'purchase', ${sessionId}, ${Date.now()})
      ON CONFLICT (ref) WHERE reason = 'purchase' DO NOTHING RETURNING 1`;
    if (inserted.length) await tx`UPDATE users SET tokens = tokens + ${tokens} WHERE id = ${userId}`;
  });
}

/** An admin's correction; never takes a balance below zero. False when it would. */
export async function adjustTokens(userId: number, delta: number, note: string) {
  const sql = await db();
  return sql.begin(async (tx) => {
    const rows = await tx`UPDATE users SET tokens = tokens + ${delta} WHERE id = ${userId} AND tokens + ${delta} >= 0 RETURNING tokens`;
    if (!rows.length) return false;
    await tx`INSERT INTO token_ledger (user_id, delta, reason, ref, at) VALUES (${userId}, ${delta}, 'admin', ${note}, ${Date.now()})`;
    return true;
  });
}
