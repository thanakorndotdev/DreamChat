import { requireMember } from '@/lib/server/auth';
import { effectivePlan, getSubscription, isLive, listPlans, usageToday } from '@/lib/server/billing';
import { stripeConfigured } from '@/lib/server/stripe';

export type BillingState = {
  plans: ReturnType<typeof listPlans>;
  plan: ReturnType<typeof effectivePlan>;
  subscription: (NonNullable<ReturnType<typeof getSubscription>> & { live: boolean }) | null;
  usage: { chat: number };
  payments: boolean;
};

/** Plans on offer, the account's current plan, and today's usage. */
export async function GET() {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const sub = getSubscription(user.id);
  const state: BillingState = {
    plans: listPlans().filter((p) => p.active),
    plan: effectivePlan(user.id),
    subscription: sub ? { ...sub, live: isLive(sub) } : null,
    usage: { chat: usageToday(user.id).chat },
    payments: stripeConfigured(),
  };
  return Response.json(state);
}
