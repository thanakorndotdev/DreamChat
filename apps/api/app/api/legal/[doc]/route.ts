import { getLegal, isLegalDoc } from '@/lib/legal';

/** Public: the web app's /privacy and /terms pages render this. */
export async function GET(_req: Request, ctx: RouteContext<'/api/legal/[doc]'>) {
  const { doc } = await ctx.params;
  if (!isLegalDoc(doc)) return new Response('Not found', { status: 404 });
  const { body, updatedAt } = await getLegal(doc);
  return Response.json({ body, updatedAt });
}
