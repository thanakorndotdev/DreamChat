import { currentUser, needsConsent } from '@/lib/auth';
import type { BillingState } from '@longrak/shared/api-types';
import { FREE_PLAN_ID } from '@longrak/shared/plans';
import { effectivePlan, getSubscription, isLive, listPlans, usageToday } from '@/lib/billing';
import { stripeConfigured } from '@/lib/stripe';
import { balanceOf, checkedInToday, getEconomy } from '@/lib/tokens';


/** Plans and token prices on offer, the account's current plan, today's usage and tokens. Works signed out too (offer only). */
export async function GET() {
  const user = await currentUser();
  const plans = (await listPlans()).filter((p) => p.active);
  const economy = await getEconomy();
  if (!user || needsConsent(user)) {
    const free = plans.find((p) => p.id === FREE_PLAN_ID) ?? plans[0];
    return Response.json({
      plans,
      plan: free,
      subscription: null,
      usage: { chat: 0, image: 0 },
      tokens: { balance: 0, checkedInToday: false },
      economy,
      payments: stripeConfigured(),
      guest: true,
    } satisfies BillingState);
  }
  const sub = await getSubscription(user.id);
  const used = await usageToday(user.id);
  const state: BillingState = {
    plans,
    plan: await effectivePlan(user.id),
    subscription: sub ? { ...sub, live: isLive(sub) } : null,
    usage: { chat: used.chat, image: used.image },
    tokens: { balance: await balanceOf(user.id), checkedInToday: await checkedInToday(user.id) },
    economy,
    payments: stripeConfigured(),
    guest: false,
  };
  return Response.json(state);
}
