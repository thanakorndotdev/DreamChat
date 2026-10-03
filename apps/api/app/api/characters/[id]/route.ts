import { requireMember } from '@/lib/auth';
import { effectivePlan } from '@/lib/billing';
import { db } from '@longrak/db';

const MAX_BYTES = 2_000_000;

/** Postgres jsonb can't hold the NUL character; drop it rather than failing the save. */
function stripNul(v: unknown): unknown {
  if (typeof v === 'string') return v.replaceAll('\0', '');
  if (Array.isArray(v)) return v.map(stripNul);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripNul(x)]));
  return v;
}

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

  const sql = await db();
  const [exists] = await sql`SELECT 1 FROM characters WHERE user_id = ${user.id} AND id = ${id}`;
  if (!exists) {
    // Catalog chats are made only by /api/catalog/[id]/start; their id ties them to that character's free replies and unlock.
    if (id.startsWith('cat-')) return new Response('ข้อมูลตัวละครไม่ถูกต้อง', { status: 400 });
    const { name, features } = await effectivePlan(user.id);
    const [{ n: count }] = await sql<{ n: number }[]>`SELECT count(*) AS n FROM characters WHERE user_id = ${user.id}`;
    if (features.maxCharacters && count >= features.maxCharacters) {
      return new Response(`แพ็กเกจ ${name} มีตัวละครได้ ${features.maxCharacters} ตัว ลบเรื่องเก่าหรืออัปเกรดเพื่อเพิ่ม`, { status: 402 });
    }
  }

  const updatedAt = typeof character.updatedAt === 'number' ? Math.floor(character.updatedAt) : Date.now();
  await sql`
    INSERT INTO characters (user_id, id, data, updated_at) VALUES (${user.id}, ${id}, ${sql.json(stripNul(character) as Parameters<typeof sql.json>[0])}, ${updatedAt})
    ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`;
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/characters/[id]'>) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const sql = await db();
  await sql`DELETE FROM characters WHERE user_id = ${user.id} AND id = ${id}`;
  return new Response(null, { status: 204 });
}
