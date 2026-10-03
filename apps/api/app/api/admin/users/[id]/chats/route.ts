import { requireAdmin } from '@/lib/auth';
import type { AdminChatSummary } from '@longrak/shared/api-types';
import { db } from '@longrak/db';

/** An account's chats, newest first, without their messages. Read-only, like every admin chat endpoint. */
export async function GET(_req: Request, ctx: RouteContext<'/api/admin/users/[id]/chats'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const userId = Number((await ctx.params).id) || 0;

  const sql = await db();
  const rows = await sql<{ id: string; name: string | null; source_id: string | null; messages: number | null; last_text: string | null; updated_at: number }[]>`
    SELECT id, data->>'name' AS name, data->>'sourceId' AS source_id,
      jsonb_array_length(coalesce(data->'messages', '[]'::jsonb)) AS messages,
      left(data->'messages'->-1->>'text', 120) AS last_text, updated_at
    FROM characters WHERE user_id = ${userId}
    ORDER BY updated_at DESC`;

  return Response.json(
    rows.map(
      (r): AdminChatSummary => ({
        id: r.id,
        name: r.name ?? '',
        sourceId: r.source_id,
        messages: r.messages ?? 0,
        lastText: r.last_text ?? '',
        updatedAt: r.updated_at,
      }),
    ),
  );
}
