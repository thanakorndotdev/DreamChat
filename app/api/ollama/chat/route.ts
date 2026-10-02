import { OFFLINE_HINT, resolveHost } from '@/lib/host';
import { requireMember } from '@/lib/server/auth';
import { countUsage, effectivePlan, usageToday } from '@/lib/server/billing';
import { pickModel, workersAi, workersAiChat } from '@/lib/workersAi';

type ChatMessage = { role: string; content: string };

/** Story notes and character drafts aren't replies, but they still cost credit; cap them separately. */
const OTHER_PER_DAY = 200;

export async function POST(req: Request) {
  // Chat spends Workers AI credit / host GPU time, so only signed-in accounts may use it.
  const user = await requireMember();
  if (user instanceof Response) return user;

  const { host: rawHost, model, messages: rawMessages, maxTokens: rawMax, purpose } = await req.json();
  if (typeof model !== 'string' || !Array.isArray(rawMessages)) {
    return new Response('คำขอไม่ครบ ต้องมี model และ messages', { status: 400 });
  }
  const isChat = purpose !== 'note' && purpose !== 'generate';

  const plan = await effectivePlan(user.id);
  const used = await usageToday(user.id);
  if (isChat && plan.features.dailyMessages && used.chat >= plan.features.dailyMessages) {
    return new Response(`วันนี้คุยครบ ${plan.features.dailyMessages} ข้อความของแพ็กเกจ ${plan.name} แล้ว พรุ่งนี้คุยต่อได้ หรืออัปเกรดเพื่อคุยเพิ่ม`, {
      status: 429,
    });
  }
  if (!isChat && used.other >= OTHER_PER_DAY) return new Response('วันนี้ใช้งาน AI ครบโควตาแล้ว ลองใหม่พรุ่งนี้', { status: 429 });

  // The plan decides how much history the AI sees, whatever the client sent.
  let messages = rawMessages as ChatMessage[];
  if (isChat) {
    const system = messages.filter((m) => m.role === 'system');
    const turns = messages.filter((m) => m.role !== 'system');
    messages = [...system, ...turns.slice(-Math.max(1, plan.features.historyWindow))];
  }

  // Optional reply cap (e.g. character generation needs room for a full JSON sheet); clamped to keep cost bounded.
  const maxTokens = typeof rawMax === 'number' && rawMax > 0 ? Math.min(Math.floor(rawMax), 2048) : undefined;

  const cf = await workersAi();
  if (cf) {
    const res = await workersAiChat(cf, plan.features.model || pickModel(cf, model), messages, req.signal, maxTokens);
    if (res.ok) await countUsage(user.id, isChat ? 'chat' : 'other');
    return res;
  }

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

  await countUsage(user.id, isChat ? 'chat' : 'other');
  return new Response(res.body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}
