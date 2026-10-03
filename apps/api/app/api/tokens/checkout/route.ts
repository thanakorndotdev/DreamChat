import { requireMember } from '@/lib/auth';
import { customerFor } from '@/lib/billing';
import { appUrl, stripe, stripeConfigured } from '@/lib/stripe';
import { getEconomy } from '@/lib/tokens';

/** A one-off Stripe payment for a token pack. The tokens are credited by the webhook once it is paid. */
export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  if (!stripeConfigured()) return new Response('ยังไม่เปิดรับชำระเงิน', { status: 503 });

  const { packId } = await req.json().catch(() => ({}));
  const pack = (await getEconomy()).packs.find((p) => p.id === packId);
  if (!pack) return new Response('ไม่พบแพ็กโทเคนนี้', { status: 404 });

  const base = appUrl(req);
  // The amount comes from here, never from the browser; the webhook trusts this metadata.
  const metadata = { kind: 'tokens', userId: String(user.id), packId: pack.id, tokens: String(pack.tokens) };
  try {
    const session = await stripe<{ url: string }>('POST', 'checkout/sessions', {
      mode: 'payment',
      customer: await customerFor(user),
      client_reference_id: String(user.id),
      locale: 'th',
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'thb', unit_amount: pack.price, product_data: { name: `หลงรักแชท ${pack.tokens.toLocaleString('th-TH')} โทเคน` } },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${base}/membership?tokens=1#tokens`,
      cancel_url: `${base}/membership#tokens`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : 'สร้างหน้าชำระเงินไม่สำเร็จ', { status: 502 });
  }
}
