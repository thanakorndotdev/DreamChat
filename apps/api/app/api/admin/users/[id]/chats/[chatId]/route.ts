import { requireAdmin } from '@/lib/auth';
import type { AdminChat } from '@longrak/shared/api-types';
import type { Character } from '@longrak/shared/types';
import { db } from '@longrak/db';

/**
 * One chat, for the admin to read when a report or dispute needs the evidence.
 * GET only: the privacy policy promises admins can't edit a chat.
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/admin/users/[id]/chats/[chatId]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { id, chatId } = await ctx.params;

  const sql = await db();
  const [row] = await sql<{ data: Character; updated_at: number }[]>`
    SELECT data, updated_at FROM characters WHERE user_id = ${Number(id) || 0} AND id = ${chatId}`;
  if (!row) return new Response('ไม่พบแชทนี้', { status: 404 });
  console.info(`[admin] ${me.username} read chat ${chatId} of user ${id}`);

  const c = row.data;
  const chat: AdminChat = {
    id: c.id,
    name: c.name,
    role: c.role,
    avatar: c.avatar,
    userName: c.userName,
    messages: (c.messages ?? []).map((m) => ({ sender: m.sender, text: m.text, ...(m.failed ? { failed: true } : {}) })),
    updatedAt: row.updated_at,
  };
  return Response.json(chat);
}
