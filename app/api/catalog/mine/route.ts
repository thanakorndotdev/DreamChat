import { toSheet } from '@/lib/catalog';
import { requireMember } from '@/lib/server/auth';
import { listCatalog } from '@/lib/server/catalog';
import { getDb } from '@/lib/server/db';
import type { Character } from '@/lib/types';

/** This account's publish requests and their review status. */
export async function GET() {
  const user = await requireMember();
  if (user instanceof Response) return user;
  return Response.json(
    listCatalog('WHERE c.author_id = ?', user.id).map((e) => ({ id: e.id, sourceId: e.sourceId, status: e.status, reviewNote: e.reviewNote, tier: e.tier })),
  );
}

/**
 * Sends one of the account's own characters to the admins for publishing. Only the character
 * sheet is copied; the conversation and anything about the player stays private.
 */
export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const { characterId } = await req.json().catch(() => ({}));
  if (typeof characterId !== 'string') return new Response('ไม่ได้ระบุตัวละคร', { status: 400 });

  const db = getDb();
  const row = db.prepare('SELECT data FROM characters WHERE user_id = ? AND id = ?').get(user.id, characterId) as { data: string } | undefined;
  if (!row) return new Response('ไม่พบตัวละครนี้', { status: 404 });
  const char = JSON.parse(row.data) as Character;
  if (char.sourceId) return new Response('ตัวละครนี้มาจากคลังอยู่แล้ว ส่งเผยแพร่ซ้ำไม่ได้', { status: 400 });
  const sheet = toSheet(char);
  if (!sheet.name.trim() || !sheet.personality.trim()) return new Response('ใส่ชื่อและนิสัยของตัวละครให้ครบก่อนส่ง', { status: 400 });

  const now = Date.now();
  const existing = db.prepare('SELECT id FROM catalog WHERE author_id = ? AND source_id = ?').get(user.id, characterId) as { id: string } | undefined;
  if (existing) {
    // Resubmitting replaces the entry and sends it back for review.
    db.prepare("UPDATE catalog SET data = ?, status = 'pending', review_note = '', updated_at = ? WHERE id = ?").run(JSON.stringify(sheet), now, existing.id);
  } else {
    db.prepare("INSERT INTO catalog (id, author_id, source_id, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)").run(
      `pub-${user.id}-${now}`,
      user.id,
      characterId,
      JSON.stringify(sheet),
      now,
      now,
    );
  }
  return new Response(null, { status: 204 });
}

/** Withdraws a request (or takes a published character down). `?source=<characterId>` */
export async function DELETE(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const source = new URL(req.url).searchParams.get('source');
  if (!source) return new Response('ไม่ได้ระบุตัวละคร', { status: 400 });
  getDb().prepare('DELETE FROM catalog WHERE author_id = ? AND source_id = ?').run(user.id, source);
  return new Response(null, { status: 204 });
}
