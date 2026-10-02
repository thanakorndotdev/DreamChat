import { getPlan, recordRedemption, setSubscription } from '@/lib/server/billing';
import { db } from '@/lib/server/db';
import { type StripeSubscription, periodEnd, stripe, verifyWebhook } from '@/lib/server/stripe';

type Event = { id: string; type: string; data: { object: Record<string, unknown> } };

async function userFor(sub: StripeSubscription): Promise<number | null> {
  if (sub.metadata?.userId) return Number(sub.metadata.userId);
  const sql = await db();
  const [row] = await sql<{ id: number }[]>`SELECT id FROM users WHERE stripe_customer_id = ${sub.customer}`;
  return row?.id ?? null;
}

async function applySubscription(sub: StripeSubscription) {
  const userId = await userFor(sub);
  const planId = sub.metadata?.planId;
  if (!userId || !planId || !(await getPlan(planId))) {
    console.error(`[stripe] subscription ${sub.id}: no matching account or plan`);
    return;
  }
  await setSubscription(userId, {
    planId,
    source: 'stripe',
    status: sub.status,
    currentPeriodEnd: periodEnd(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    stripeSubscriptionId: sub.id,
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response('webhook not configured', { status: 503 });
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get('stripe-signature'), secret)) return new Response('bad signature', { status: 400 });

  const event = JSON.parse(raw) as Event;
  const sql = await db();
  const [seen] = await sql`SELECT 1 FROM stripe_events WHERE id = ${event.id}`;
  if (seen) return new Response(null, { status: 200 });

  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      const meta = (obj.metadata ?? {}) as Record<string, string>;
      if (typeof obj.subscription === 'string') await applySubscription(await stripe<StripeSubscription>('GET', `subscriptions/${obj.subscription}`));
      // A code counts as used once the payment went through, not when someone only opened checkout.
      if (meta.code && meta.userId) await recordRedemption(meta.code, Number(meta.userId));
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applySubscription(obj as unknown as StripeSubscription);
      break;
    case 'invoice.paid': {
      const subId = (obj.subscription ?? (obj.parent as { subscription_details?: { subscription?: string } })?.subscription_details?.subscription) as string | undefined;
      if (subId) await applySubscription(await stripe<StripeSubscription>('GET', `subscriptions/${subId}`));
      break;
    }
  }

  await sql`INSERT INTO stripe_events (id, at) VALUES (${event.id}, ${Date.now()}) ON CONFLICT DO NOTHING`;
  return new Response(null, { status: 200 });
}
