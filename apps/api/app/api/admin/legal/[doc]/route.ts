import { requireAdmin } from '@/lib/auth';
import { getLegal, isLegalDoc, setLegal } from '@/lib/legal';

const MAX_CHARS = 100_000;

export async function GET(_req: Request, ctx: RouteContext<'/api/admin/legal/[doc]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { doc } = await ctx.params;
  if (!isLegalDoc(doc)) return new Response('ไม่พบเอกสารนี้', { status: 404 });
  return Response.json(await getLegal(doc));
}

/** { body } saves a new text dated today; { reset: true } goes back to the text shipped in code. */
export async function PUT(req: Request, ctx: RouteContext<'/api/admin/legal/[doc]'>) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const { doc } = await ctx.params;
  if (!isLegalDoc(doc)) return new Response('ไม่พบเอกสารนี้', { status: 404 });

  const { body, reset } = (await req.json().catch(() => ({}))) as { body?: unknown; reset?: unknown };
  if (reset === true) {
    await setLegal(doc, null);
  } else {
    if (typeof body !== 'string' || !body.trim()) return new Response('เนื้อหาว่างไม่ได้', { status: 400 });
    if (body.length > MAX_CHARS) return new Response(`เนื้อหายาวเกิน ${MAX_CHARS.toLocaleString('th-TH')} ตัวอักษร`, { status: 400 });
    await setLegal(doc, body.trim());
  }
  console.info(`[admin] ${me.username} ${reset === true ? 'reset' : 'updated'} legal/${doc}`);
  return Response.json(await getLegal(doc));
}
