import { startSession, verifyDecoy, verifyPassword } from '@/lib/auth';
import { db } from '@longrak/db';
import { allow, blocked, clientIp, reset } from '@/lib/rateLimit';

const WINDOW = 15 * 60_000;
/** Wrong passwords for one account from one address; keyed by both so a stranger can't lock someone else out. */
const PER_ACCOUNT = 10;
/** Wrong passwords from one address across all accounts (password spraying). */
const PER_IP = 40;
/** Wrong passwords for one account from anywhere (guessing from many addresses). High, so it rarely locks out the owner. */
const PER_ACCOUNT_ANY_IP = 60;

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== 'string' || typeof password !== 'string') {
    return new Response('กรอกชื่อผู้ใช้และรหัสผ่าน', { status: 400 });
  }
  const name = username.trim().slice(0, 64);
  const ip = clientIp(req);
  const accountKey = `login:${ip}:${name.toLowerCase()}`;
  const anyIpKey = `login-any:${name.toLowerCase()}`;
  if ((await blocked(accountKey, PER_ACCOUNT)) || (await blocked(`login-ip:${ip}`, PER_IP)) || (await blocked(anyIpKey, PER_ACCOUNT_ANY_IP))) {
    return new Response('ลองผิดหลายครั้งเกินไป รอสัก 15 นาทีแล้วลองใหม่', { status: 429 });
  }

  const sql = await db();
  const [user] = await sql<{ id: number; username: string; password_hash: string }[]>`
    SELECT id, username, password_hash FROM users WHERE username = ${name}`;
  const ok = user ? await verifyPassword(password, user.password_hash) : (await verifyDecoy(password), false);
  if (!ok) {
    await allow(accountKey, PER_ACCOUNT, WINDOW);
    await allow(`login-ip:${ip}`, PER_IP, WINDOW);
    await allow(anyIpKey, PER_ACCOUNT_ANY_IP, WINDOW);
    return new Response('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', { status: 401 });
  }

  await reset(accountKey);
  await startSession(req, user.id);
  return Response.json({ username: user.username });
}
