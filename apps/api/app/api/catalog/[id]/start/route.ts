import { TIER_LABEL } from '@longrak/shared/plans';
import { isAdultUser, requireMember } from '@/lib/auth';
import { effectivePlan } from '@/lib/billing';
import { getEntry } from '@/lib/catalog';
import { db } from '@longrak/db';
import type { Character } from '@longrak/shared/types';

/** Starts a private chat with a published character: copies its sheet into the account's own characters. */
export async function POST(_req: Request, ctx: RouteContext<'/api/catalog/[id]/start'>) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const entry = await getEntry((await ctx.params).id);
  if (!entry || entry.status !== 'published') return new Response('ไม่พบตัวละครนี้ หรือยังไม่เปิดให้คุย', { status: 404 });

  if (entry.sheet.adult && !isAdultUser(user)) return new Response('ตัวละครนี้สำหรับผู้ที่อายุ 18 ปีขึ้นไป', { status: 403 });
  const plan = await effectivePlan(user.id);
  if (entry.tier > plan.level) {
    return new Response(`ตัวละครนี้สำหรับสมาชิก ${TIER_LABEL[entry.tier] ?? 'พรีเมียม'} อัปเกรดแพ็กเกจเพื่อคุยได้`, { status: 402 });
  }

  const sql = await db();
  const [{ n: count }] = await sql<{ n: number }[]>`SELECT count(*) AS n FROM characters WHERE user_id = ${user.id}`;
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
  await sql`INSERT INTO characters (user_id, id, data, updated_at) VALUES (${user.id}, ${character.id}, ${sql.json(character)}, ${now})`;
  return Response.json(character);
}
