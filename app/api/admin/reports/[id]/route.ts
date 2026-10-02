import type { ReportStatus } from '@/lib/reports';
import { requireAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

const STATUSES: ReportStatus[] = ['open', 'in_progress', 'resolved', 'closed'];

/** The attached screenshot, if any. */
export async function GET(_req: Request, ctx: RouteContext<'/api/admin/reports/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const sql = await db();
  const [row] = await sql<{ screenshot: string | null }[]>`SELECT screenshot FROM bug_reports WHERE id = ${Number((await ctx.params).id) || 0}`;
  if (!row) return new Response('ไม่พบรายงานนี้', { status: 404 });
  return Response.json({ screenshot: row.screenshot });
}

/** status and/or reply (the reporter sees the reply under their report). */
export async function PATCH(req: Request, ctx: RouteContext<'/api/admin/reports/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const id = Number((await ctx.params).id) || 0;
  const b = (await req.json().catch(() => ({}))) as { status?: unknown; reply?: unknown };
  if (b.status !== undefined && !STATUSES.includes(b.status as ReportStatus)) return new Response('สถานะไม่ถูกต้อง', { status: 400 });
  const sql = await db();
  const rows = await sql`
    UPDATE bug_reports SET
      status = coalesce(${(b.status as string) ?? null}, status),
      admin_reply = coalesce(${typeof b.reply === 'string' ? b.reply.replaceAll('\0', '').slice(0, 2000) : null}, admin_reply),
      updated_at = ${Date.now()}
    WHERE id = ${id} RETURNING id`;
  if (!rows.length) return new Response('ไม่พบรายงานนี้', { status: 404 });
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<'/api/admin/reports/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const sql = await db();
  await sql`DELETE FROM bug_reports WHERE id = ${Number((await ctx.params).id) || 0}`;
  return new Response(null, { status: 204 });
}
