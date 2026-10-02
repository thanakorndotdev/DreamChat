import { currentUser, needsConsent } from '@/lib/server/auth';
import { FREE_PLAN_ID, type Plan } from '@/lib/plans';
import { type Subscription, effectivePlan, getSubscription, isLive, listPlans, usageToday } from '@/lib/server/billing';
import { stripeConfigured } from '@/lib/server/stripe';

export type BillingState = {
  plans: Plan[];
  plan: Plan;
  subscription: (Subscription & { live: boolean }) | null;
  usage: { chat: number };
  payments: boolean;
  /** Not signed in: only the plans are real; everything else is the free plan's defaults. */
  guest: boolean;
};

/** Plans on offer, the account's current plan, and today's usage. Works signed out too (plans only). */
export async function GET() {
  const user = await currentUser();
  if (!user || needsConsent(user)) {
    const plans = (await listPlans()).filter((p) => p.active);
    const free = plans.find((p) => p.id === FREE_PLAN_ID) ?? plans[0];
    return Response.json({ plans, plan: free, subscription: null, usage: { chat: 0 }, payments: stripeConfigured(), guest: true } satisfies BillingState);
  }
  const sub = await getSubscription(user.id);
  const state: BillingState = {
    plans: (await listPlans()).filter((p) => p.active),
    plan: await effectivePlan(user.id),
    subscription: sub ? { ...sub, live: isLive(sub) } : null,
    usage: { chat: (await usageToday(user.id)).chat },
    payments: stripeConfigured(),
    guest: false,
  };
  return Response.json(state);
}
