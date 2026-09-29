import { OFFLINE_HINT, parseHost } from '@/lib/host';

export async function GET(req: Request) {
  const host = parseHost(new URL(req.url).searchParams.get('host'));
  if (!host) return new Response('Host URL ไม่ถูกต้อง', { status: 400 });

  try {
    const res = await fetch(`${host}/api/tags`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) return new Response(`Ollama ตอบกลับ HTTP ${res.status}`, { status: 502 });
    const data = (await res.json()) as { models?: { name: string }[] };
    return Response.json({ models: (data.models ?? []).map((m) => m.name) });
  } catch {
    return new Response(OFFLINE_HINT, { status: 502 });
  }
}
