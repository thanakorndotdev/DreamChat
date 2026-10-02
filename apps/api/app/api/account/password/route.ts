import { PASSWORD_MIN, hashPassword, requireMember, startSession, verifyPassword } from '@/lib/auth';
import { db } from '@longrak/db';
import { allow } from '@/lib/rateLimit';

/** Changes the password; every other device is signed out, this one gets a fresh session. */
export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  if (!(await allow(`password:${user.id}`, 10, 15 * 60_000))) return new Response('ลองหลายครั้งเกินไป รอสัก 15 นาที', { status: 429 });

  const { current, next } = await req.json().catch(() => ({}));
  if (typeof next !== 'string' || next.length < PASSWORD_MIN) return new Response(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${PASSWORD_MIN} ตัว`, { status: 400 });
  const sql = await db();
  const [row] = await sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id = ${user.id}`;
  if (typeof current !== 'string' || !(await verifyPassword(current, row.password_hash))) {
    return new Response('รหัสผ่านปัจจุบันไม่ถูกต้อง', { status: 400 });
  }
  await sql.begin(async (tx) => {
    await tx`UPDATE users SET password_hash = ${await hashPassword(next)} WHERE id = ${user.id}`;
    await tx`DELETE FROM sessions WHERE user_id = ${user.id}`;
  });
  await startSession(req, user.id);
  return new Response(null, { status: 204 });
}
