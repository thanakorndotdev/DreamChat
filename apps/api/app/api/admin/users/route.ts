import { PASSWORD_MIN, USERNAME_RULE, hashPassword, requireAdmin } from '@/lib/auth';
import type { AdminUser } from '@longrak/shared/api-types';
import { ageFromBirthdate } from '@longrak/shared/age';
import { CONSENT_VERSION, EMAIL_RULE, normalizePhone } from '@longrak/shared/legal';
import { type Subscription, isLive, listPlans } from '@/lib/billing';
import { db } from '@longrak/db';

function planOf(sub: Subscription | null, plans: Map<string, string>): AdminUser['plan'] {
  if (!sub || !isLive(sub)) return null;
  return {
    id: sub.planId,
    name: plans.get(sub.planId) ?? sub.planId,
    source: sub.source,
    until: sub.currentPeriodEnd,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
}


export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;

  const sql = await db();
  const users = await sql<
    {
      id: number;
      username: string;
      is_admin: boolean;
      created_at: number;
      email: string | null;
      phone: string | null;
      consent_version: number;
      marketing_consent: boolean;
      birthdate: string | null;
      guardian_consent: boolean;
      characters: number;
      sessions: number;
      plan_id: string | null;
      source: Subscription['source'] | null;
      status: string | null;
      current_period_end: number | null;
      cancel_at_period_end: boolean | null;
    }[]
  >`
    SELECT u.id, u.username, u.is_admin, u.created_at, u.email, u.phone, u.consent_version, u.marketing_consent, u.birthdate, u.guardian_consent,
      (SELECT count(*) FROM characters c WHERE c.user_id = u.id) AS characters,
      (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ${Date.now()}) AS sessions,
      sub.plan_id, sub.source, sub.status, sub.current_period_end, sub.cancel_at_period_end
    FROM users u LEFT JOIN subscriptions sub ON sub.user_id = u.id
    ORDER BY u.created_at DESC`;
  const planNames = new Map((await listPlans()).map((p) => [p.id, p.name]));

  return Response.json(
    users.map(
      (u): AdminUser => ({
        id: u.id,
        username: u.username,
        isAdmin: u.is_admin,
        createdAt: u.created_at,
        email: u.email,
        phone: u.phone,
        consented: u.consent_version >= CONSENT_VERSION,
        marketing: u.marketing_consent,
        birthdate: u.birthdate,
        age: ageFromBirthdate(u.birthdate),
        guardianConsent: u.guardian_consent,
        characters: u.characters,
        sessions: u.sessions,
        plan: planOf(
          u.plan_id
            ? {
                planId: u.plan_id,
                source: u.source!,
                status: u.status!,
                currentPeriodEnd: u.current_period_end!,
                cancelAtPeriodEnd: !!u.cancel_at_period_end,
                stripeSubscriptionId: null,
              }
            : null,
          planNames,
        ),
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

  const sql = await db();
  const [nameTaken] = await sql`SELECT 1 FROM users WHERE username = ${name}`;
  if (nameTaken) return new Response('ชื่อผู้ใช้นี้มีคนใช้แล้ว', { status: 409 });
  const mail = typeof email === 'string' && email.trim() ? email.trim() : null;
  if (mail && !EMAIL_RULE.test(mail)) return new Response('อีเมลไม่ถูกต้อง', { status: 400 });
  const [mailTaken] = mail ? await sql`SELECT 1 FROM users WHERE email = ${mail}` : [];
  if (mailTaken) return new Response('อีเมลนี้มีบัญชีอื่นใช้แล้ว', { status: 409 });
  const tel = typeof phone === 'string' && phone.trim() ? normalizePhone(phone) : null;
  if (typeof phone === 'string' && phone.trim() && !tel) return new Response('เบอร์โทรไม่ถูกต้อง', { status: 400 });
  // The person still accepts the PDPA terms themselves on first sign-in.
  await sql`
    INSERT INTO users (username, password_hash, created_at, is_admin, email, phone)
    VALUES (${name}, ${await hashPassword(password)}, ${Date.now()}, ${!!isAdmin}, ${mail}, ${tel})`;
  return new Response(null, { status: 201 });
}
