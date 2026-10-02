import { CONSENT_VERSION, EMAIL_RULE, birthdateProblem, normalizePhone } from '@/lib/legal';
import { PASSWORD_MIN, USERNAME_RULE, hashPassword, startSession } from '@/lib/server/auth';
import { db } from '@/lib/server/db';
import { allow, clientIp } from '@/lib/server/rateLimit';

export async function POST(req: Request) {
  // Slows down scripted sign-ups (each account gets a free daily allowance of AI replies).
  if (!(await allow(`register:${clientIp(req)}`, 5, 60 * 60_000))) {
    return new Response('สมัครจากเครือข่ายนี้หลายครั้งเกินไป รอสักชั่วโมงแล้วลองใหม่', { status: 429 });
  }
  const { username, password, email, phone, consent, marketing, birthdate, guardian } = await req.json().catch(() => ({}));
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
  const birthError = birthdateProblem(birthdate, guardian);
  if (birthError) return new Response(birthError, { status: 400 });
  if (consent !== true) return new Response('ต้องยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานก่อนสมัคร', { status: 400 });

  const sql = await db();
  const [nameTaken] = await sql`SELECT 1 FROM users WHERE username = ${name}`;
  if (nameTaken) return new Response('ชื่อผู้ใช้นี้มีคนใช้แล้ว', { status: 409 });
  const [mailTaken] = await sql`SELECT 1 FROM users WHERE email = ${mail}`;
  if (mailTaken) {
    return new Response('อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน', { status: 409 });
  }
  let userId: number;
  try {
    const now = Date.now();
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO users (username, password_hash, created_at, email, phone, consent_version, consent_at, marketing_consent, birthdate, guardian_consent)
      VALUES (${name}, ${await hashPassword(password)}, ${now}, ${mail}, ${tel}, ${CONSENT_VERSION}, ${now}, ${marketing === true},
        ${birthdate as string}, ${guardian === true})
      RETURNING id`;
    userId = row.id;
  } catch {
    // Lost a race with another sign-up for the same name or email.
    return new Response('ชื่อผู้ใช้หรืออีเมลนี้มีคนใช้แล้ว', { status: 409 });
  }

  await startSession(req, userId);
  return Response.json({ username: name });
}
