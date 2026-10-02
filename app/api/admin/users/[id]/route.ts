import { PASSWORD_MIN, USERNAME_RULE, hashPassword, requireAdmin } from '@/lib/server/auth';
import { ageFromBirthdate } from '@/lib/age';
import { EMAIL_RULE, normalizePhone } from '@/lib/legal';
import { FREE_PLAN_ID } from '@/lib/plans';
import { getPlan, getSubscription, isLive, setSubscription } from '@/lib/server/billing';
import { db } from '@/lib/server/db';

async function target(id: string) {
  const sql = await db();
  const [user] = await sql<{ id: number; username: string }[]>`SELECT id, username FROM users WHERE id = ${Number(id) || 0}`;
  return user;
}

/** Thrown inside the transaction to roll back every change and answer with this message. */
class Refuse extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Any of: username, password, email, phone, isAdmin, signOut (ends every session of that account),
 * grant { planId, days } (free membership, added to what's left of the same plan) or revoke (ends a non-Stripe membership).
 * All or nothing: one invalid field leaves the account unchanged.
 */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/users/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const user = await target((await ctx.params).id);
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
    birthdate?: unknown;
    guardianConsent?: unknown;
  };

  // Checked up front: these need lookups outside the transaction.
  const grantPlan = body.grant && typeof body.grant.planId === 'string' ? await getPlan(body.grant.planId) : null;
  const sub = body.grant || body.revoke ? await getSubscription(user.id) : null;
  const passwordHash = typeof body.password === 'string' && body.password.length >= PASSWORD_MIN ? await hashPassword(body.password) : null;

  const sql = await db();
  try {
    await sql.begin(async (tx) => {
      if (body.username !== undefined) {
        const name = typeof body.username === 'string' ? body.username.trim() : '';
        if (!USERNAME_RULE.test(name)) throw new Refuse('ชื่อผู้ใช้ต้องยาว 3–32 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้', 400);
        const [taken] = await tx<{ id: number }[]>`SELECT id FROM users WHERE username = ${name}`;
        if (taken && taken.id !== user.id) throw new Refuse('ชื่อผู้ใช้นี้มีคนใช้แล้ว', 409);
        await tx`UPDATE users SET username = ${name} WHERE id = ${user.id}`;
      }
      if (body.password !== undefined) {
        if (!passwordHash) throw new Refuse(`รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN} ตัว`, 400);
        await tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${user.id}`;
      }
      if (body.isAdmin !== undefined) {
        // Keeps at least the current admin able to get back in.
        if (user.id === me.id && !body.isAdmin) throw new Refuse('ถอดสิทธิ์แอดมินของตัวเองไม่ได้', 400);
        await tx`UPDATE users SET is_admin = ${!!body.isAdmin} WHERE id = ${user.id}`;
      }
      if (body.email !== undefined) {
        const mail = typeof body.email === 'string' ? body.email.trim() : '';
        if (mail && !EMAIL_RULE.test(mail)) throw new Refuse('อีเมลไม่ถูกต้อง', 400);
        const [taken] = mail ? await tx<{ id: number }[]>`SELECT id FROM users WHERE email = ${mail}` : [];
        if (taken && taken.id !== user.id) throw new Refuse('อีเมลนี้มีบัญชีอื่นใช้แล้ว', 409);
        await tx`UPDATE users SET email = ${mail || null} WHERE id = ${user.id}`;
      }
      if (body.phone !== undefined) {
        const raw = typeof body.phone === 'string' ? body.phone.trim() : '';
        const tel = raw ? normalizePhone(raw) : null;
        if (raw && !tel) throw new Refuse('เบอร์โทรไม่ถูกต้อง', 400);
        await tx`UPDATE users SET phone = ${tel} WHERE id = ${user.id}`;
      }
      if (body.birthdate !== undefined) {
        // Corrections only come through here; people can't change their own birthdate once set.
        const birth = typeof body.birthdate === 'string' && body.birthdate ? body.birthdate : null;
        if (birth && ageFromBirthdate(birth) === null) throw new Refuse('วันเกิดไม่ถูกต้อง', 400);
        await tx`UPDATE users SET birthdate = ${birth} WHERE id = ${user.id}`;
      }
      if (body.guardianConsent !== undefined) await tx`UPDATE users SET guardian_consent = ${body.guardianConsent === true} WHERE id = ${user.id}`;
      if (body.revoke) {
        if (sub?.source === 'stripe' && isLive(sub)) throw new Refuse('แพ็กเกจนี้ชำระผ่าน Stripe ยกเลิกได้ที่ Stripe Dashboard', 409);
        await tx`DELETE FROM subscriptions WHERE user_id = ${user.id}`;
      }
      if (body.signOut) await tx`DELETE FROM sessions WHERE user_id = ${user.id}`;
    });
  } catch (e) {
    if (e instanceof Refuse) return new Response(e.message, { status: e.status });
    throw e;
  }

  if (body.grant && !body.revoke) {
    const days = Math.floor(Number(body.grant.days) || 0);
    if (!grantPlan || grantPlan.id === FREE_PLAN_ID) return new Response('เลือกแพ็กเกจที่จะให้', { status: 400 });
    if (days < 1 || days > 36500) return new Response('จำนวนวันต้องอยู่ระหว่าง 1–36500', { status: 400 });
    if (sub && isLive(sub) && sub.source === 'stripe') {
      return new Response('บัญชีนี้มีแพ็กเกจที่ชำระผ่าน Stripe อยู่ ยกเลิกใน Stripe ก่อนแล้วค่อยให้แพ็กเกจฟรี', { status: 409 });
    }
    const from = sub && isLive(sub) && sub.planId === grantPlan.id ? sub.currentPeriodEnd : Date.now();
    await setSubscription(user.id, {
      planId: grantPlan.id,
      source: 'admin',
      status: 'active',
      currentPeriodEnd: from + days * 86_400_000,
      cancelAtPeriodEnd: true,
      stripeSubscriptionId: null,
    });
  }

  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/admin/users/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const user = await target((await ctx.params).id);
  if (!user) return new Response('ไม่พบบัญชีนี้', { status: 404 });
  if (user.id === me.id) return new Response('ลบบัญชีของตัวเองไม่ได้', { status: 400 });
  // Stripe would keep charging a card nobody can sign in to cancel.
  const sub = await getSubscription(user.id);
  if (sub && isLive(sub) && sub.source === 'stripe' && !sub.cancelAtPeriodEnd) {
    return new Response('บัญชีนี้ยังมีแพ็กเกจที่ตัดบัตรอัตโนมัติ ยกเลิก subscription ใน Stripe Dashboard ก่อนแล้วค่อยลบ', { status: 409 });
  }

  // Sessions, chats, membership and code redemptions go with it (ON DELETE CASCADE).
  const sql = await db();
  await sql`DELETE FROM users WHERE id = ${user.id}`;
  return new Response(null, { status: 204 });
}
