import type { Report } from '@/lib/reports';
import { requireAdmin } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

/** Every report, newest first, without screenshots (fetched one at a time from the detail view). */
export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const sql = await db();
  const rows = await sql<(Omit<Report, 'author' | 'screenshot'> & { hasScreenshot: boolean; username: string | null; email: string | null })[]>`
    SELECT r.id, r.kind, r.title, r.body, r.screenshot IS NOT NULL AS "hasScreenshot", r.context, r.status,
      r.admin_reply AS "adminReply", r.created_at AS "createdAt", r.updated_at AS "updatedAt", u.username, u.email
    FROM bug_reports r LEFT JOIN users u ON u.id = r.user_id
    ORDER BY (r.status IN ('open', 'in_progress')) DESC, r.created_at DESC
    LIMIT 500`;
  return Response.json(
    rows.map(({ username, email, ...r }) => ({ ...r, screenshot: null, author: username ? { username, email } : null })),
  );
}
