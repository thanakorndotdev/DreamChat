import { requireMember } from '@/lib/auth';
import { db } from '@longrak/db';
import { appUrl, stripe, stripeConfigured } from '@/lib/stripe';

/** Stripe's hosted page for changing the card, seeing receipts, and cancelling auto-renewal. */
export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  if (!stripeConfigured()) return new Response('ยังไม่เปิดรับชำระเงิน', { status: 503 });
  const sql = await db();
  const [row] = await sql<{ stripe_customer_id: string | null }[]>`SELECT stripe_customer_id FROM users WHERE id = ${user.id}`;
  if (!row.stripe_customer_id) return new Response('บัญชีนี้ยังไม่เคยชำระเงิน', { status: 404 });
  try {
    const session = await stripe<{ url: string }>('POST', 'billing_portal/sessions', {
      customer: row.stripe_customer_id,
      return_url: `${appUrl(req)}/membership`,
      locale: 'th',
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'เปิดหน้าจัดการไม่สำเร็จ', { status: 502 });
  }
}
