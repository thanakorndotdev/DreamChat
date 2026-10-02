import { toSheet } from '@/lib/catalog';
import { requireAdmin } from '@/lib/server/auth';
import { listCatalog } from '@/lib/server/catalog';
import { db } from '@/lib/server/db';

/** Every catalog entry: the admins' own characters and users' publish requests. Never any conversation. */
export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  return Response.json(await listCatalog());
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { sheet, tier, status } = await req.json().catch(() => ({}));
  const data = toSheet(sheet ?? {});
  if (!data.name.trim()) return new Response('ใส่ชื่อตัวละครก่อน', { status: 400 });
  const now = Date.now();
  const id = `cat-${now}`;
  const published = status === 'published';
  const sql = await db();
  await sql`
    INSERT INTO catalog (id, author_id, data, status, tier, created_at, updated_at, published_at)
    VALUES (${id}, ${me.id}, ${sql.json(data)}, ${published ? 'published' : 'draft'}, ${Number(tier) || 0}, ${now}, ${now}, ${published ? now : null})`;
  return Response.json({ id });
}
