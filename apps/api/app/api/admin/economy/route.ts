import { requireAdmin } from '@/lib/auth';
import { getEconomy, parseEconomy, setEconomy } from '@/lib/tokens';

export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  return Response.json(await getEconomy());
}

/** Saves message cost, default unlock price and the token packs. A price change applies to the next purchase. */
export async function PUT(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const economy = parseEconomy(await req.json().catch(() => ({})));
  if (typeof economy === 'string') return new Response(economy, { status: 400 });
  await setEconomy(economy);
  return Response.json(economy);
}
