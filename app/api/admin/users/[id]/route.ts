import { PASSWORD_MIN, USERNAME_RULE, envAdmin, hashPassword, requireAdmin } from '@/lib/server/auth';
import { EMAIL_RULE, normalizePhone } from '@/lib/legal';
import { FREE_PLAN_ID } from '@/lib/plans';
import { getPlan, getSubscription, isLive, setSubscription } from '@/lib/server/billing';
import { getDb } from '@/lib/server/db';

function target(id: string) {
  return getDb().prepare('SELECT id, username FROM users WHERE id = ?').get(Number(id)) as { id: number; username: string } | undefined;
}

/**
 * Any of: username, password, email, phone, isAdmin, signOut (ends every session of that account),
 * grant { planId, days } (free membership, added to what's left of the same plan) or revoke (ends a non-Stripe membership).
 */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/users/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const user = target((await ctx.params).id);
  if (!user) return new Response('ไม่พบบัญชีนี้', { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: unknown;
    password?: unknown;
    email?: unknown;
    phone?: unknown;
    isAdmin?: unknown;
    signOut?: unknown;
    grant?: { planId?: unknown; days?: unknown };
    revoke?: unknown;
  };
  const db = getDb();

  if (body.username !== undefined) {
    const name = typeof body.username === 'string' ? body.username.trim() : '';
    if (!USERNAME_RULE.test(name)) return new Response('ชื่อผู้ใช้ต้องยาว 3–32 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้', { status: 400 });
    const taken = db.prepare('SELECT id FROM users WHERE username = ?').get(name) as { id: number } | undefined;
    if (taken && taken.id !== user.id) return new Response('ชื่อผู้ใช้นี้มีคนใช้แล้ว', { status: 409 });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(name, user.id);
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < PASSWORD_MIN) {
      return new Response(`รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัว`, { status: 400 });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(body.password), user.id);
  }
  if (body.isAdmin !== undefined) {
    // Keeps at least the current admin able to get back in.
    if (user.id === me.id && !body.isAdmin) return new Response('ถอดสิทธิ์แอดมินของตัวเองไม่ได้', { status: 400 });
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(body.isAdmin ? 1 : 0, user.id);
  }
  if (body.email !== undefined) {
    const mail = typeof body.email === 'string' ? body.email.trim() : '';
    if (mail && !EMAIL_RULE.test(mail)) return new Response('อีเมลไม่ถูกต้อง', { status: 400 });
    const taken = mail ? (db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(mail) as { id: number } | undefined) : undefined;
    if (taken && taken.id !== user.id) return new Response('อีเมลนี้มีบัญชีอื่นใช้แล้ว', { status: 409 });
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(mail || null, user.id);
  }
  if (body.phone !== undefined) {
    const raw = typeof body.phone === 'string' ? body.phone.trim() : '';
    const tel = raw ? normalizePhone(raw) : null;
    if (raw && !tel) return new Response('เบอร์โทรไม่ถูกต้อง', { status: 400 });
    db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(tel, user.id);
  }
  if (body.grant) {
    const plan = typeof body.grant.planId === 'string' ? getPlan(body.grant.planId) : null;
    const days = Math.floor(Number(body.grant.days) || 0);
    if (!plan || plan.id === FREE_PLAN_ID) return new Response('เลือกแพ็กเกจที่จะให้', { status: 400 });
    if (days < 1 || days > 36500) return new Response('จำนวนวันต้องอยู่ระหว่าง 1–36500', { status: 400 });
    const sub = getSubscription(user.id);
    if (sub && isLive(sub) && sub.source === 'stripe') {
      return new Response('บัญชีนี้มีแพ็กเกจที่ชำระผ่าน Stripe อยู่ ยกเลิกใน Stripe ก่อนแล้วค่อยให้แพ็กเกจฟรี', { status: 409 });
    }
    const from = sub && isLive(sub) && sub.planId === plan.id ? sub.currentPeriodEnd : Date.now();
    setSubscription(user.id, {
      planId: plan.id,
      source: 'admin',
      status: 'active',
      currentPeriodEnd: from + days * 86_400_000,
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: null,
    });
  }
  if (body.revoke) {
    const sub = getSubscription(user.id);
    if (sub?.source === 'stripe' && isLive(sub)) return new Response('แพ็กเกจนี้ชำระผ่าน Stripe ยกเลิกได้ที่ Stripe Dashboard', { status: 409 });
    db.prepare('DELETE FROM subscriptions WHERE user_id = ?').run(user.id);
  }
  if (body.signOut) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/admin/users/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const user = target((await ctx.params).id);
  if (!user) return new Response('ไม่พบบัญชีนี้', { status: 404 });
  if (user.id === me.id) return new Response('ลบบัญชีของตัวเองไม่ได้', { status: 400 });
  if (envAdmin(user.username)) return new Response('บัญชีนี้อยู่ใน ADMIN_USERNAMES เอาออกจาก env ก่อนแล้วค่อยลบ', { status: 400 });
  // Sessions and characters go with it (ON DELETE CASCADE).
  getDb().prepare('DELETE FROM users WHERE id = ?').run(user.id);
  return new Response(null, { status: 204 });
}
