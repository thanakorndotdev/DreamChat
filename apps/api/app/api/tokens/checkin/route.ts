import { requireMember } from '@/lib/auth';
import { effectivePlan } from '@/lib/billing';
import { checkIn } from '@/lib/tokens';

/** Today's check-in: members get their plan's daily tokens, once per day (Bangkok time). */
export async function POST() {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const result = await checkIn(user.id, await effectivePlan(user.id));
  if (typeof result === 'string') return new Response(result, { status: 409 });
  return Response.json(result);
}
