import { type CatalogStatus, toSheet } from '@/lib/catalog';
import { requireAdmin } from '@/lib/server/auth';
import { getEntry } from '@/lib/server/catalog';
import { getDb } from '@/lib/server/db';

const STATUSES: CatalogStatus[] = ['draft', 'pending', 'published', 'rejected'];

/** Any of: sheet, tier, status, reviewNote. Approving a request is status "published"; rejecting is "rejected" with a note. */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/catalog/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { id } = await ctx.params;
  const entry = getEntry(id);
  if (!entry) return new Response('ไม่พบตัวละครนี้', { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { sheet?: unknown; tier?: unknown; status?: unknown; reviewNote?: unknown };
  const status = body.status === undefined ? entry.status : (body.status as CatalogStatus);
  if (!STATUSES.includes(status)) return new Response('สถานะไม่ถูกต้อง', { status: 400 });
  const sheet = body.sheet === undefined ? entry.sheet : toSheet(body.sheet as object);
  if (!sheet.name.trim()) return new Response('ใส่ชื่อตัวละครก่อน', { status: 400 });
  const tier = body.tier === undefined ? entry.tier : Math.max(0, Math.min(2, Number(body.tier) || 0));
  const note = typeof body.reviewNote === 'string' ? body.reviewNote.slice(0, 500) : entry.reviewNote;
  const now = Date.now();

  getDb()
    .prepare('UPDATE catalog SET data = ?, tier = ?, status = ?, review_note = ?, updated_at = ?, published_at = ? WHERE id = ?')
    .run(JSON.stringify(sheet), tier, status, note, now, status === 'published' ? (entry.publishedAt ?? now) : null, id);
  return new Response(null, { status: 204 });
}

/** Removes the entry. Chats people already started keep their own copy. */
export async function DELETE(_req: Request, ctx: RouteContext<'/api/admin/catalog/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  getDb().prepare('DELETE FROM catalog WHERE id = ?').run((await ctx.params).id);
  return new Response(null, { status: 204 });
}
