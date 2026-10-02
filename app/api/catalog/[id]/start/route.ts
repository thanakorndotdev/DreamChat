import { TIER_LABEL } from '@/lib/plans';
import { requireMember } from '@/lib/server/auth';
import { effectivePlan } from '@/lib/server/billing';
import { getEntry } from '@/lib/server/catalog';
import { getDb } from '@/lib/server/db';
import type { Character } from '@/lib/types';

/** Starts a private chat with a published character: copies its sheet into the account's own characters. */
export async function POST(_req: Request, ctx: RouteContext<'/api/catalog/[id]/start'>) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const entry = getEntry((await ctx.params).id);
  if (!entry || entry.status !== 'published') return new Response('ไม่พบตัวละครนี้ หรือยังไม่เปิดให้คุย', { status: 404 });

  const plan = effectivePlan(user.id);
  if (entry.tier > plan.level) {
    return new Response(`ตัวละครนี้สำหรับสมาชิก ${TIER_LABEL[entry.tier] ?? 'พรีเมียม'} อัปเกรดแพ็กเกจเพื่อคุยได้`, { status: 402 });
  }

  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) AS n FROM characters WHERE user_id = ?').get(user.id) as { n: number }).n;
  if (plan.features.maxCharacters && count >= plan.features.maxCharacters) {
    return new Response(`แพ็กเกจ ${plan.name} มีเรื่องได้ ${plan.features.maxCharacters} เรื่อง ลบเรื่องเก่าหรืออัปเกรดเพื่อเริ่มเรื่องใหม่`, { status: 402 });
  }

  const now = Date.now();
  const character: Character = {
    ...entry.sheet,
    id: `cat-${entry.id}-${now}`,
    sourceId: entry.id,
    userName: '',
    messages: [{ sender: 'char', text: entry.sheet.firstMessage || '*หันมามองคุณ*' }],
    updatedAt: now,
  };
  db.prepare('INSERT INTO characters (user_id, id, data, updated_at) VALUES (?, ?, ?, ?)').run(user.id, character.id, JSON.stringify(character), now);
  return Response.json(character);
}
