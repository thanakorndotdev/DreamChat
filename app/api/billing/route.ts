import { requireMember } from '@/lib/server/auth';
import type { Plan } from '@/lib/plans';
import { type Subscription, effectivePlan, getSubscription, isLive, listPlans, usageToday } from '@/lib/server/billing';
import { stripeConfigured } from '@/lib/server/stripe';

export type BillingState = {
  plans: Plan[];
  plan: Plan;
  subscription: (Subscription & { live: boolean }) | null;
  usage: { chat: number };
  payments: boolean;
};

/** Plans on offer, the account's current plan, and today's usage. */
export async function GET() {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const sub = await getSubscription(user.id);
  const state: BillingState = {
    plans: (await listPlans()).filter((p) => p.active),
    plan: await effectivePlan(user.id),
    subscription: sub ? { ...sub, live: isLive(sub) } : null,
    usage: { chat: (await usageToday(user.id)).chat },
    payments: stripeConfigured(),
  };
  return Response.json(state);
}
