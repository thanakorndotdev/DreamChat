import { requireAdmin } from '@/lib/auth';
import type { AdminChat, AdminEvidenceDetail } from '@longrak/shared/api-types';
import { db } from '@longrak/db';
import { purgeEvidence } from '@/lib/evidence';
import { toEvidence } from '../route';

/** One evidence copy with its messages. GET only: a copy is never changed. */
export async function GET(_req: Request, ctx: RouteContext<'/api/admin/evidence/[id]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  await purgeEvidence();
  const sql = await db();
  const [row] = await sql<(Parameters<typeof toEvidence>[0] & { chat: AdminChat })[]>`
    SELECT id, user_id, username, chat->>'name' AS chat_name, jsonb_array_length(chat->'messages') AS messages, note, saved_by, created_at, expires_at, chat
    FROM chat_evidence WHERE id = ${Number((await ctx.params).id) || 0}`;
  if (!row) return new Response('ไม่พบหลักฐานนี้ หรือครบกำหนดเก็บแล้ว', { status: 404 });
  console.info(`[admin] ${me.username} read evidence ${row.id}`);
  return Response.json({ ...toEvidence(row), chat: row.chat } satisfies AdminEvidenceDetail);
}
