import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies, headers } from 'next/headers';
import { ADMIN_PROXY_HEADER } from '@longrak/shared/forward';
import { ADULT_AGE, GUARDIAN_UNDER, ageFromBirthdate } from '@longrak/shared/age';
import { CONSENT_VERSION } from '@longrak/shared/legal';
import { db } from '@longrak/db';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const COOKIE = 'dc_session';
const SESSION_DAYS = 30;

export type User = {
  id: number;
  username: string;
  isAdmin: boolean;
  email: string | null;
  phone: string | null;
  consentVersion: number;
  birthdate: string | null;
  guardianConsent: boolean;
  /** Real age from the birthdate; null until it's filled in. */
  age: number | null;
};

export const USERNAME_RULE = /^[\p{L}\p{M}\p{N}_.-]{3,32}$/u;
/** New passwords only; older accounts keep signing in with what they have until they change it. */
export const PASSWORD_MIN = 8;

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
  return (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')).split(',')[0].trim() === 'https';
}

export async function startSession(req: Request, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  const sql = await db();
  await sql`DELETE FROM sessions WHERE expires_at < ${Date.now()}`;
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${sha256(token)}, ${userId}, ${expires})`;
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
  if (token) {
    const sql = await db();
    await sql`DELETE FROM sessions WHERE token_hash = ${sha256(token)}`;
  }
  store.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sql = await db();
  const [row] = await sql<
    { id: number; username: string; is_admin: boolean; email: string | null; phone: string | null; consent_version: number; birthdate: string | null; guardian_consent: boolean }[]
  >`
    SELECT users.id, users.username, users.is_admin, users.email, users.phone, users.consent_version, users.birthdate, users.guardian_consent
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ${sha256(token)} AND sessions.expires_at > ${Date.now()}`;
  return row
    ? {
        id: row.id,
        username: row.username,
        isAdmin: row.is_admin,
        email: row.email,
        phone: row.phone,
        consentVersion: row.consent_version,
        birthdate: row.birthdate,
        guardianConsent: row.guardian_consent,
        age: ageFromBirthdate(row.birthdate),
      }
    : null;
}

export const UNAUTHORIZED = () => new Response('กรุณาเข้าสู่ระบบก่อน', { status: 401 });

/** Accounts from before PDPA consent (or missing email/phone) must finish that step before using the app. */
export function needsConsent(user: User) {
  if (user.consentVersion < CONSENT_VERSION || !user.email || !user.phone || user.age === null) return true;
  return user.age < GUARDIAN_UNDER && !user.guardianConsent;
}

/** 18+ mode is decided here, from the account's real birthdate, never by anything the browser sends. */
export const isAdultUser = (user: User) => user.age !== null && user.age >= ADULT_AGE;

/** The signed-in account that has accepted the current terms, or the response to send back. */
export async function requireMember(): Promise<User | Response> {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  if (needsConsent(user)) return new Response('กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนใช้งาน', { status: 403 });
  return user;
}

/**
 * The signed-in admin, or the response to send back when the caller isn't one. Admin endpoints
 * also have to come through the admin app (apps/admin stamps ADMIN_PROXY_SECRET), so an admin's
 * session on the public site can't drive them.
 */
export async function requireAdmin(): Promise<User | Response> {
  const secret = process.env.ADMIN_PROXY_SECRET;
  if (secret) {
    const got = (await headers()).get(ADMIN_PROXY_HEADER) ?? '';
    if (got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return new Response('Not found', { status: 404 });
  } else if (process.env.NODE_ENV === 'production') {
    return new Response('ADMIN_PROXY_SECRET is not set', { status: 503 });
  }
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  if (!user.isAdmin) return new Response('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น', { status: 403 });
  return user;
}

/** Hash of a throwaway password, checked when the username doesn't exist so both cases take as long. */
let decoy: Promise<string> | null = null;
export async function verifyDecoy(password: string) {
  decoy ??= hashPassword(randomBytes(12).toString('hex'));
  await verifyPassword(password, await decoy);
}
