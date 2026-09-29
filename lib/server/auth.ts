import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { getDb } from './db';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const COOKIE = 'dc_session';
const SESSION_DAYS = 30;

export type User = { id: number; username: string };

export const USERNAME_RULE = /^[\p{L}\p{M}\p{N}_.-]{3,32}$/u;
export const PASSWORD_MIN = 6;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Behind the Cloudflare tunnel the app sees plain HTTP, so trust the forwarded protocol. */
function isHttps(req: Request) {
  return (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')) === 'https';
}

export async function startSession(req: Request, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps(req),
    path: '/',
    expires: new Date(expires),
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  store.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT users.id AS id, users.username AS username FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    )
    .get(sha256(token), Date.now()) as User | undefined;
  return row ? { id: row.id, username: row.username } : null;
}

export const UNAUTHORIZED = () => new Response('กรุณาเข้าสู่ระบบก่อน', { status: 401 });

/** In-memory brake on password guessing: 10 failures per username per 15 minutes. */
const failures = new Map<string, { count: number; until: number }>();
const WINDOW = 15 * 60_000;

export function isLockedOut(username: string) {
  const f = failures.get(username.toLowerCase());
  return !!f && f.until > Date.now() && f.count >= 10;
}

export function recordFailure(username: string) {
  const key = username.toLowerCase();
  const f = failures.get(key);
  const fresh = !f || f.until < Date.now();
  failures.set(key, { count: fresh ? 1 : f.count + 1, until: fresh ? Date.now() + WINDOW : f.until });
}

export function clearFailures(username: string) {
  failures.delete(username.toLowerCase());
}
