import { requireMember } from '@/lib/auth';
import { db } from '@longrak/db';
import { unlockCharacter } from '@/lib/tokens';

/** Spends tokens on unlimited chat with one of the account's characters. */
export async function POST(_req: Request, ctx: RouteContext<'/api/characters/[id]/unlock'>) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const sql = await db();
  const [mine] = await sql`SELECT 1 FROM characters WHERE user_id = ${user.id} AND id = ${id}`;
  if (!mine) return new Response('ไม่พบเรื่องนี้ในบัญชีของคุณ', { status: 404 });
  const result = await unlockCharacter(user.id, id);
  if (typeof result === 'string') return new Response(result, { status: 402 });
  return Response.json(result);
}
