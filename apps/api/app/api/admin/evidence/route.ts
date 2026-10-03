import { requireAdmin } from '@/lib/auth';
import type { AdminChat, AdminEvidence } from '@longrak/shared/api-types';
import type { Character } from '@longrak/shared/types';
import { db } from '@longrak/db';
import { evidenceExpiry, purgeEvidence } from '@/lib/evidence';

type Row = { id: number; user_id: number | null; username: string; chat_name: string | null; messages: number | null; note: string; saved_by: string; created_at: number; expires_at: number };

export const toEvidence = (r: Row): AdminEvidence => ({
  id: r.id,
  userId: r.user_id,
  username: r.username,
  chatName: r.chat_name ?? '',
  messages: r.messages ?? 0,
  note: r.note,
  savedBy: r.saved_by,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});

/** Every evidence copy still within its keeping period, newest first. */
export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  await purgeEvidence();
  const sql = await db();
  const rows = await sql<Row[]>`
    SELECT id, user_id, username, chat->>'name' AS chat_name, jsonb_array_length(chat->'messages') AS messages, note, saved_by, created_at, expires_at
    FROM chat_evidence ORDER BY created_at DESC`;
  return Response.json(rows.map(toEvidence));
}

/** { userId, chatId, note } freezes that chat as it is now. */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { userId, chatId, note } = (await req.json().catch(() => ({}))) as { userId?: unknown; chatId?: unknown; note?: unknown };
  if (typeof userId !== 'number' || typeof chatId !== 'string') return new Response('คำขอไม่ถูกต้อง', { status: 400 });

  const sql = await db();
  const [row] = await sql<{ data: Character; username: string }[]>`
    SELECT c.data, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.user_id = ${userId} AND c.id = ${chatId}`;
  if (!row) return new Response('ไม่พบแชทนี้', { status: 404 });

  const c = row.data;
  const chat: AdminChat = {
    id: c.id,
    name: c.name,
    role: c.role,
    avatar: c.avatar,
    userName: c.userName,
    messages: (c.messages ?? []).map((m) => ({ sender: m.sender, text: m.text, ...(m.failed ? { failed: true } : {}) })),
    updatedAt: c.updatedAt,
  };
  const now = Date.now();
  await sql`
    INSERT INTO chat_evidence (user_id, username, chat_id, chat, note, saved_by, created_at, expires_at)
    VALUES (${userId}, ${row.username}, ${chatId}, ${sql.json(chat)}, ${typeof note === 'string' ? note.trim().slice(0, 500) : ''}, ${me.username}, ${now}, ${evidenceExpiry(now)})`;
  console.info(`[admin] ${me.username} saved chat ${chatId} of user ${userId} as evidence`);
  return new Response(null, { status: 201 });
}
