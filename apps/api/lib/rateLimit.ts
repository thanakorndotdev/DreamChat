import { db } from '@longrak/db';

/**
 * Fixed-window counters in Postgres, so they hold across restarts and every app instance shares them.
 */

/** Counts one event for `key`; false once it happened `limit` times within `windowMs`. */
export async function allow(key: string, limit: number, windowMs: number): Promise<boolean> {
  const sql = await db();
  const now = Date.now();
  const [row] = await sql<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, lim, until) VALUES (${key}, 1, ${limit}, ${now + windowMs})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.until < ${now} THEN 1 ELSE rate_limits.count + 1 END,
      until = CASE WHEN rate_limits.until < ${now} THEN ${now + windowMs} ELSE rate_limits.until END,
      lim = ${limit}
    RETURNING count`;
  // Now and then, clear out windows that ended long ago.
  if (Math.random() < 0.01) await sql`DELETE FROM rate_limits WHERE until < ${now - 86_400_000}`;
  return row.count <= limit;
}

/** Whether `key` is already at `limit` in its current window, without counting. */
export async function blocked(key: string, limit: number): Promise<boolean> {
  const sql = await db();
  const [row] = await sql<{ count: number }[]>`SELECT count FROM rate_limits WHERE key = ${key} AND until > ${Date.now()}`;
  return !!row && row.count >= limit;
}

export async function reset(key: string) {
  const sql = await db();
  await sql`DELETE FROM rate_limits WHERE key = ${key}`;
}

/**
 * The visitor's address. Behind the Cloudflare tunnel, CF-Connecting-IP is set by Cloudflare;
 * direct requests (the tailnet port) don't carry it and fall back to X-Forwarded-For.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}
