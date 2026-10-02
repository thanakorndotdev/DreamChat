import { CONSENT_VERSION, EMAIL_RULE, normalizePhone } from '@/lib/legal';
import { PASSWORD_MIN, USERNAME_RULE, hashPassword, startSession } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';

export async function POST(req: Request) {
  const { username, password, email, phone, consent, marketing } = await req.json().catch(() => ({}));
  const name = typeof username === 'string' ? username.trim() : '';
  if (!USERNAME_RULE.test(name)) {
    return new Response('ชื่อผู้ใช้ต้องยาว 3–32 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้', { status: 400 });
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return new Response(`รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัว`, { status: 400 });
  }
  const mail = typeof email === 'string' ? email.trim() : '';
  if (!EMAIL_RULE.test(mail)) return new Response('อีเมลไม่ถูกต้อง', { status: 400 });
  const tel = typeof phone === 'string' ? normalizePhone(phone) : null;
  if (!tel) return new Response('เบอร์โทรไม่ถูกต้อง ใช้เบอร์ไทย เช่น 0812345678', { status: 400 });
  if (consent !== true) return new Response('ต้องยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานก่อนสมัคร', { status: 400 });

  const db = getDb();
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) {
    return new Response('ชื่อผู้ใช้นี้มีคนใช้แล้ว', { status: 409 });
  }
  if (db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE').get(mail)) {
    return new Response('อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน', { status: 409 });
  }
  let userId: number;
  try {
    const now = Date.now();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (username, password_hash, created_at, email, phone, consent_version, consent_at, marketing_consent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(name, await hashPassword(password), now, mail, tel, CONSENT_VERSION, now, marketing === true ? 1 : 0);
    userId = Number(lastInsertRowid);
  } catch {
    // Lost a race with another sign-up for the same name or email.
    return new Response('ชื่อผู้ใช้หรืออีเมลนี้มีคนใช้แล้ว', { status: 409 });
  }

  await startSession(req, userId);
  return Response.json({ username: name });
}
