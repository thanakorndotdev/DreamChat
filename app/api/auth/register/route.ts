import { PASSWORD_MIN, USERNAME_RULE, hashPassword, startSession } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const name = typeof username === 'string' ? username.trim() : '';
  if (!USERNAME_RULE.test(name)) {
    return new Response('ชื่อผู้ใช้ต้องยาว 3–32 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้', { status: 400 });
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return new Response(`รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัว`, { status: 400 });
  }

  const db = getDb();
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) {
    return new Response('ชื่อผู้ใช้นี้มีคนใช้แล้ว', { status: 409 });
  }
  let userId: number;
  try {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
      .run(name, await hashPassword(password), Date.now());
    userId = Number(lastInsertRowid);
  } catch {
    // Lost a race with another sign-up for the same name.
    return new Response('ชื่อผู้ใช้นี้มีคนใช้แล้ว', { status: 409 });
  }

  await startSession(req, userId);
  return Response.json({ username: name });
}
