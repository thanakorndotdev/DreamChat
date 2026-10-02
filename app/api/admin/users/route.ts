import { PASSWORD_MIN, USERNAME_RULE, envAdmin, hashPassword, requireAdmin } from '@/lib/server/auth';
import { CONSENT_VERSION, EMAIL_RULE, normalizePhone } from '@/lib/legal';
import { getPlan, getSubscription, isLive } from '@/lib/server/billing';
import { getDb } from '@/lib/server/db';

function planOf(userId: number): AdminUser['plan'] {
  const sub = getSubscription(userId);
  if (!sub || !isLive(sub)) return null;
  return {
    id: sub.planId,
    name: getPlan(sub.planId)?.name ?? sub.planId,
    source: sub.source,
    until: sub.currentPeriodEnd,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}

export type AdminUser = {
  id: number;
  username: string;
  isAdmin: boolean;
  /** Admin through ADMIN_USERNAMES, which the admin page can't turn off. */
  envAdmin: boolean;
  createdAt: number;
  email: string | null;
  phone: string | null;
  consented: boolean;
  marketing: boolean;
  /** How many chats they keep; the chats themselves are private and never sent here. */
  characters: number;
  sessions: number;
  plan: { id: string; name: string; source: string; until: number; status: string; cancelAtPeriodEnd: boolean } | null;
};

export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;

  const db = getDb();
  const users = db
    .prepare(
      `SELECT id, username, is_admin, created_at, email, phone, consent_version, marketing_consent,
        (SELECT COUNT(*) FROM characters WHERE user_id = users.id) AS characters,
        (SELECT COUNT(*) FROM sessions WHERE user_id = users.id AND expires_at > ?) AS sessions
       FROM users ORDER BY created_at DESC`,
    )
    .all(Date.now()) as {
    id: number;
    username: string;
    is_admin: number;
    created_at: number;
    email: string | null;
    phone: string | null;
    consent_version: number;
    marketing_consent: number;
    characters: number;
    sessions: number;
  }[];

  return Response.json(
    users.map(
      (u): AdminUser => ({
        id: u.id,
        username: u.username,
        isAdmin: !!u.is_admin || envAdmin(u.username),
        envAdmin: envAdmin(u.username),
        createdAt: u.created_at,
        email: u.email,
        phone: u.phone,
        consented: u.consent_version >= CONSENT_VERSION,
        marketing: !!u.marketing_consent,
        characters: u.characters,
        sessions: u.sessions,
        plan: planOf(u.id),
      }),
    ),
  );
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;

  const { username, password, isAdmin, email, phone } = await req.json().catch(() => ({}));
  const name = typeof username === 'string' ? username.trim() : '';
  if (!USERNAME_RULE.test(name)) return new Response('ชื่อผู้ใช้ต้องยาว 3–32 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้', { status: 400 });
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return new Response(`รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัว`, { status: 400 });
  }

  const db = getDb();
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) return new Response('ชื่อผู้ใช้นี้มีคนใช้แล้ว', { status: 409 });
  const mail = typeof email === 'string' && email.trim() ? email.trim() : null;
  if (mail && !EMAIL_RULE.test(mail)) return new Response('อีเมลไม่ถูกต้อง', { status: 400 });
  if (mail && db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(mail)) return new Response('อีเมลนี้มีบัญชีอื่นใช้แล้ว', { status: 409 });
  const tel = typeof phone === 'string' && phone.trim() ? normalizePhone(phone) : null;
  if (typeof phone === 'string' && phone.trim() && !tel) return new Response('เบอร์โทรไม่ถูกต้อง', { status: 400 });
  // The person still accepts the PDPA terms themselves on first sign-in.
  db.prepare('INSERT INTO users (username, password_hash, created_at, is_admin, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
    name,
    await hashPassword(password),
    Date.now(),
    isAdmin ? 1 : 0,
    mail,
    tel,
  );
  return new Response(null, { status: 201 });
}
