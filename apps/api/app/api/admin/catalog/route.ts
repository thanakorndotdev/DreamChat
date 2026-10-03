import { toSheet } from '@longrak/shared/catalog';
import { requireAdmin } from '@/lib/auth';
import { listCatalog, parsePrice } from '@/lib/catalog';
import { db } from '@longrak/db';

/** Every catalog entry: the admins' own characters and users' publish requests. Never any conversation. */
export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  return Response.json(await listCatalog());
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { sheet, tier, unlockPrice, status } = await req.json().catch(() => ({}));
  const data = toSheet(sheet ?? {});
  if (!data.name.trim()) return new Response('ใส่ชื่อตัวละครก่อน', { status: 400 });
  const now = Date.now();
  const id = `cat-${now}`;
  const published = status === 'published';
  const sql = await db();
  await sql`
    INSERT INTO catalog (id, author_id, data, status, tier, unlock_price, created_at, updated_at, published_at)
    VALUES (${id}, ${me.id}, ${sql.json(data)}, ${published ? 'published' : 'draft'}, ${Number(tier) || 0}, ${parsePrice(unlockPrice)}, ${now}, ${now}, ${published ? now : null})`;
  return Response.json({ id });
}
