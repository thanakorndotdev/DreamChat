import { requireMember } from '@/lib/auth';
import { getPromptPay, syncPromptPay } from '@/lib/promptpay';

/** Where a PromptPay payment stands; the QR page polls this until it's paid. */
export async function GET(_req: Request, ctx: RouteContext<'/api/billing/promptpay/[id]'>) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const payment = await getPromptPay(id, user.id);
  if (!payment) return new Response('ไม่พบรายการนี้', { status: 404 });
  try {
    return Response.json({ ...payment, status: await syncPromptPay(payment) });
  } catch {
    // Stripe unreachable for a moment: report what we know and let the page ask again.
    return Response.json(payment);
  }
}
