import { clearFailures, isLockedOut, recordFailure, startSession, verifyPassword } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== 'string' || typeof password !== 'string') {
    return new Response('กรอกชื่อผู้ใช้และรหัสผ่าน', { status: 400 });
  }
  const name = username.trim();
  if (isLockedOut(name)) {
    return new Response('ลองผิดหลายครั้งเกินไป รอสัก 15 นาทีแล้วลองใหม่', { status: 429 });
  }

  const user = getDb().prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(name) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordFailure(name);
    return new Response('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', { status: 401 });
  }

  clearFailures(name);
  await startSession(req, user.id);
  return Response.json({ username: user.username });
}
