import { OFFLINE_HINT, parseHost } from '@/lib/host';

export async function POST(req: Request) {
  const { host: rawHost, model, messages } = await req.json();
  const host = parseHost(rawHost);
  if (!host) return new Response('Host URL ไม่ถูกต้อง', { status: 400 });
  if (typeof model !== 'string' || !Array.isArray(messages)) {
    return new Response('คำขอไม่ครบ ต้องมี model และ messages', { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options: { temperature: 0.85, top_p: 0.95 } }),
      signal: req.signal,
    });
  } catch {
    return new Response(OFFLINE_HINT, { status: 502 });
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    const notFound = res.status === 404 ? ` — ไม่พบโมเดล "${model}" ลองรัน ollama pull ${model}` : '';
    return new Response(`Ollama ตอบกลับ HTTP ${res.status}${notFound}${notFound ? '' : detail ? `: ${detail}` : ''}`, {
      status: 502,
    });
  }

  return new Response(res.body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}
