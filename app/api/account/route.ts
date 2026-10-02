import { CONSENT_VERSION, EMAIL_RULE, normalizePhone } from '@/lib/legal';
import { UNAUTHORIZED, currentUser } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';

/**
 * Records PDPA consent and fills in email/phone. Existing accounts land here once after the
 * policy changes; the profile fields are only required when the account doesn't have them yet.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { consent, marketing, email, phone } = await req.json().catch(() => ({}));

  const db = getDb();
  const mail = typeof email === 'string' && email.trim() ? email.trim() : user.email;
  if (!mail || !EMAIL_RULE.test(mail)) return new Response('อีเมลไม่ถูกต้อง', { status: 400 });
  const tel = typeof phone === 'string' && phone.trim() ? normalizePhone(phone) : user.phone;
  if (!tel) return new Response('เบอร์โทรไม่ถูกต้อง ใช้เบอร์ไทย เช่น 0812345678', { status: 400 });
  if (consent !== true) return new Response('ต้องยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานก่อนใช้งานต่อ', { status: 400 });

  const taken = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(mail) as { id: number } | undefined;
  if (taken && taken.id !== user.id) return new Response('อีเมลนี้มีบัญชีอื่นใช้แล้ว', { status: 409 });

  db.prepare('UPDATE users SET email = ?, phone = ?, consent_version = ?, consent_at = ?, marketing_consent = ? WHERE id = ?').run(
    mail,
    tel,
    CONSENT_VERSION,
    Date.now(),
    marketing === true ? 1 : 0,
    user.id,
  );
  return new Response(null, { status: 204 });
}
