import { getPlan, recordRedemption, setSubscription } from '@/lib/server/billing';
import { getDb } from '@/lib/server/db';
import { type StripeSubscription, periodEnd, stripe, verifyWebhook } from '@/lib/server/stripe';

type Event = { id: string; type: string; data: { object: Record<string, unknown> } };

function userFor(sub: StripeSubscription): number | null {
  if (sub.metadata?.userId) return Number(sub.metadata.userId);
  const row = getDb().prepare('SELECT id FROM users WHERE stripe_customer_id = ?').get(sub.customer) as { id: number } | undefined;
  return row?.id ?? null;
}

function applySubscription(sub: StripeSubscription) {
  const userId = userFor(sub);
  const planId = sub.metadata?.planId;
  if (!userId || !planId || !getPlan(planId)) {
    console.error(`[stripe] subscription ${sub.id}: no matching account or plan`);
    return;
  }
  setSubscription(userId, {
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
  const db = getDb();
  if (db.prepare('SELECT 1 FROM stripe_events WHERE id = ?').get(event.id)) return new Response(null, { status: 200 });

  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      const meta = (obj.metadata ?? {}) as Record<string, string>;
      if (typeof obj.subscription === 'string') applySubscription(await stripe<StripeSubscription>('GET', `subscriptions/${obj.subscription}`));
      // A code counts as used once the payment went through, not when someone only opened checkout.
      if (meta.code && meta.userId) recordRedemption(meta.code, Number(meta.userId));
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      applySubscription(obj as unknown as StripeSubscription);
      break;
    case 'invoice.paid': {
      const subId = (obj.subscription ?? (obj.parent as { subscription_details?: { subscription?: string } })?.subscription_details?.subscription) as string | undefined;
      if (subId) applySubscription(await stripe<StripeSubscription>('GET', `subscriptions/${subId}`));
      break;
    }
  }

  db.prepare('INSERT OR IGNORE INTO stripe_events (id, at) VALUES (?, ?)').run(event.id, Date.now());
  return new Response(null, { status: 200 });
}
