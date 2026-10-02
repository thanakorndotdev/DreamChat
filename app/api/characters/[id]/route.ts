import { requireMember } from '@/lib/server/auth';
import { effectivePlan } from '@/lib/server/billing';
import { getDb } from '@/lib/server/db';

const MAX_BYTES = 2_000_000;

export async function PUT(req: Request, ctx: RouteContext<'/api/characters/[id]'>) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return new Response('ข้อมูลตัวละครใหญ่เกินไป', { status: 413 });
  let character: { id?: unknown; name?: unknown; messages?: unknown; updatedAt?: unknown };
  try {
    character = JSON.parse(raw);
  } catch {
    return new Response('ข้อมูลไม่ถูกต้อง', { status: 400 });
  }
  if (character.id !== id || typeof character.name !== 'string' || !Array.isArray(character.messages)) {
    return new Response('ข้อมูลตัวละครไม่ครบ', { status: 400 });
  }

  const db = getDb();
  if (!db.prepare('SELECT 1 FROM characters WHERE user_id = ? AND id = ?').get(user.id, id)) {
    const { name, features } = effectivePlan(user.id);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM characters WHERE user_id = ?').get(user.id) as { n: number }).n;
    if (features.maxCharacters && count >= features.maxCharacters) {
      return new Response(`แพ็กเกจ ${name} มีตัวละครได้ ${features.maxCharacters} ตัว ลบเรื่องเก่าหรืออัปเกรดเพื่อเพิ่ม`, { status: 402 });
    }
  }

  db
    .prepare(
      `INSERT INTO characters (user_id, id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(user.id, id, raw, typeof character.updatedAt === 'number' ? character.updatedAt : Date.now());
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/characters/[id]'>) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  getDb().prepare('DELETE FROM characters WHERE user_id = ? AND id = ?').run(user.id, id);
  return new Response(null, { status: 204 });
}
