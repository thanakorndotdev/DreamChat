import { OFFLINE_HINT, resolveHost } from '@/lib/host';
import { UNAUTHORIZED, currentUser } from '@/lib/server/auth';
import { pickModel, workersAi, workersAiChat } from '@/lib/workersAi';

export async function POST(req: Request) {
  // Chat spends Workers AI credit / host GPU time, so only signed-in accounts may use it.
  if (!(await currentUser())) return UNAUTHORIZED();

  const { host: rawHost, model, messages, maxTokens: rawMax } = await req.json();
  if (typeof model !== 'string' || !Array.isArray(messages)) {
    return new Response('คำขอไม่ครบ ต้องมี model และ messages', { status: 400 });
  }

  // Optional reply cap (e.g. character generation needs room for a full JSON sheet); clamped to keep cost bounded.
  const maxTokens = typeof rawMax === 'number' && rawMax > 0 ? Math.min(Math.floor(rawMax), 2048) : undefined;

  const cf = workersAi();
  if (cf) return workersAiChat(cf, pickModel(cf, model), messages, req.signal, maxTokens);

  const host = resolveHost(rawHost);
  if (!host) return new Response('Host URL ไม่ถูกต้อง', { status: 400 });

  let res: Response;
  try {
    res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options: { temperature: 0.85, top_p: 0.95, ...(maxTokens && { num_predict: maxTokens }) } }),
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
