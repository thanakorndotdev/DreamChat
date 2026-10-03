import { CONSENT_VERSION, EMAIL_RULE, birthdateProblem, normalizePhone } from '@longrak/shared/legal';
import { UNAUTHORIZED, currentUser, endSession, verifyPassword } from '@/lib/auth';
import { getSubscription, isLive } from '@/lib/billing';
import { allow } from '@/lib/rateLimit';
import { db } from '@longrak/db';

/**
 * Records PDPA consent and fills in email/phone. Existing accounts land here once after the
 * policy changes; the profile fields are only required when the account doesn't have them yet.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  const { consent, marketing, email, phone, birthdate, guardian } = await req.json().catch(() => ({}));

  const mail = typeof email === 'string' && email.trim() ? email.trim() : user.email;
  if (!mail || !EMAIL_RULE.test(mail)) return new Response('อีเมลไม่ถูกต้อง', { status: 400 });
  const tel = typeof phone === 'string' && phone.trim() ? normalizePhone(phone) : user.phone;
  if (!tel) return new Response('เบอร์โทรไม่ถูกต้อง ใช้เบอร์ไทย เช่น 0812345678', { status: 400 });
  // The birthdate is set once; after that only an admin can correct it (so nobody can age themselves up for 18+).
  const birth = user.birthdate ?? (typeof birthdate === 'string' ? birthdate : null);
  const birthError = birthdateProblem(birth, guardian === true || user.guardianConsent);
  if (birthError) return new Response(birthError, { status: 400 });
  if (consent !== true) return new Response('ต้องยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานก่อนใช้งานต่อ', { status: 400 });

  const sql = await db();
  const [taken] = await sql<{ id: number }[]>`SELECT id FROM users WHERE email = ${mail}`;
  if (taken && taken.id !== user.id) return new Response('อีเมลนี้มีบัญชีอื่นใช้แล้ว', { status: 409 });

  // Re-accepting a newer policy starts with the newsletter box unticked; that mustn't drop an earlier opt-in.
  await sql`
    UPDATE users SET email = ${mail}, phone = ${tel}, consent_version = ${CONSENT_VERSION}, consent_at = ${Date.now()},
      marketing_consent = marketing_consent OR ${marketing === true}, birthdate = ${birth}, guardian_consent = ${guardian === true || user.guardianConsent}
    WHERE id = ${user.id}`;
  return new Response(null, { status: 204 });
}

/**
 * Deletes the account and everything in it (chats, publish requests' author link, membership,
 * reports' author link) — the PDPA right to erasure. Needs the password, and refuses while a
 * card subscription would keep charging.
 */
export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user) return UNAUTHORIZED();
  if (!(await allow(`delete:${user.id}`, 5, 15 * 60_000))) return new Response('ลองหลายครั้งเกินไป รอสัก 15 นาที', { status: 429 });
  const { password } = await req.json().catch(() => ({}));
  const sql = await db();
  const [row] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id = ${user.id}`;
  if (typeof password !== 'string' || !(await verifyPassword(password, row.password_hash))) {
    return new Response('รหัสผ่านไม่ถูกต้อง', { status: 400 });
  }
  const sub = await getSubscription(user.id);
  if (sub && isLive(sub) && sub.source === 'stripe' && !sub.cancelAtPeriodEnd) {
    return new Response('ยังมีแพ็กเกจที่ต่ออายุอัตโนมัติอยู่ ยกเลิกที่หน้าแพ็กเกจสมาชิกก่อน แล้วค่อยลบบัญชี', { status: 409 });
  }
  await sql`DELETE FROM users WHERE id = ${user.id}`;
  await endSession();
  return new Response(null, { status: 204 });
}
