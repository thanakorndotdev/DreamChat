import { requireMember } from '@/lib/auth';
import { characterAccess } from '@/lib/tokens';

/** Free replies used with this character, whether it is unlocked, and what unlocking costs. */
export async function GET(_req: Request, ctx: RouteContext<'/api/characters/[id]/access'>) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  return Response.json(await characterAccess(user.id, (await ctx.params).id));
}
