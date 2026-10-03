import { adultBlocker } from '@longrak/shared/age';
import { OFFLINE_HINT, resolveHost } from '@/lib/host';
import { isAdultUser, requireMember } from '@/lib/auth';
import { effectivePlan, releaseUsage, reserveUsage } from '@/lib/billing';
import { type Charge, chargeReply, refundReply } from '@/lib/tokens';
import { db } from '@longrak/db';
import { type ChatMessage, draftPrompt, notePrompt, replyPrompt } from '@/lib/prompts';
import type { Paywall } from '@longrak/shared/tokens';
import type { Character, Message } from '@longrak/shared/types';
import { workersAi, workersAiChat } from '@/lib/workersAi';

/**
 * The only way to the AI. The browser names a task and its inputs; the prompt itself is built
 * here (lib/server/prompts.ts) from the stored character, the plan and the account's real age.
 *
 *   { task: 'reply', characterId, history: [{ sender, text }], payWithTokens? }   → 402 Paywall JSON past the free replies
 *   { task: 'note', characterId }                → header X-Note-Up-To
 *   { task: 'draft', outline, adult }
 */

/** Story notes and character drafts aren't replies, but they still cost credit; cap them separately. */
const OTHER_PER_DAY = 200;
const MAX_TURN_CHARS = 4000;
const MAX_HISTORY = 200;
/** After trimming to the plan's window; keeps one reply's prompt bounded even with a big window. */
const MAX_HISTORY_CHARS = 60_000;

const bad = (text: string, status = 400) => new Response(text, { status });

function parseHistory(raw: unknown): Pick<Message, 'sender' | 'text'>[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_HISTORY) return null;
  const out: Pick<Message, 'sender' | 'text'>[] = [];
  for (const m of raw) {
    const { sender, text } = (m ?? {}) as { sender?: unknown; text?: unknown };
    if ((sender !== 'user' && sender !== 'char') || typeof text !== 'string' || text.length > MAX_TURN_CHARS) return null;
    out.push({ sender, text });
  }
  return out[out.length - 1].sender === 'user' ? out : null;
}

async function loadCharacter(userId: number, id: unknown): Promise<Character | null> {
  if (typeof id !== 'string') return null;
  const sql = await db();
  const [row] = await sql<{ data: Character }[]>`SELECT data FROM characters WHERE user_id = ${userId} AND id = ${id}`;
  return row?.data ?? null;
}

export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const plan = await effectivePlan(user.id);
  const adultAllowed = isAdultUser(user);

  let messages: ChatMessage[];
  let maxTokens: number;
  let kind: 'chat' | 'other' = 'other';
  let charId = '';
  const headers: Record<string, string> = { 'Content-Type': 'application/x-ndjson; charset=utf-8' };

  if (body.task === 'reply') {
    const char = await loadCharacter(user.id, body.characterId);
    if (!char) return bad('ไม่พบเรื่องนี้ในบัญชีของคุณ', 404);
    const parsed = parseHistory(body.history);
    if (!parsed) return bad('บทสนทนาไม่ถูกต้อง');
    // Newest turns first until the character budget runs out.
    const history: typeof parsed = [];
    let budget = MAX_HISTORY_CHARS;
    for (const turn of parsed.slice(-Math.max(1, plan.features.historyWindow)).reverse()) {
      if ((budget -= turn.text.length) < 0) break;
      history.unshift(turn);
    }
    if (!history.length) return bad('ข้อความยาวเกินไป');
    // The rude-mode switch comes from the chat screen (the stored copy may be a moment behind), but it only
    // takes effect for an 18+ account and when the character's and player's in-story ages are adult.
    const rude = body.rude === true && adultAllowed && !adultBlocker(char);
    messages = replyPrompt(char, history, { notesInPrompt: plan.features.memoryNotes, historyWindow: plan.features.historyWindow, rude });
    maxTokens = 1024;
    kind = 'chat';
    charId = char.id;
  } else if (body.task === 'note') {
    if (plan.features.memoryNotes <= 0) return bad('แพ็กเกจนี้ไม่มีความจำระยะยาว', 402);
    const char = await loadCharacter(user.id, body.characterId);
    if (!char) return bad('ไม่พบเรื่องนี้ในบัญชีของคุณ', 404);
    const note = notePrompt(char);
    if (!note) return bad('ยังไม่มีบทสนทนาใหม่พอให้จด', 409);
    messages = note.messages;
    maxTokens = 400;
    headers['X-Note-Up-To'] = String(note.upTo);
  } else if (body.task === 'draft') {
    if (body.adult === true && !adultAllowed) return bad('สร้างตัวละคร 18+ ได้เฉพาะบัญชีที่อายุ 18 ปีขึ้นไป', 403);
    messages = draftPrompt(typeof body.outline === 'string' ? body.outline : '', body.adult === true);
    maxTokens = 2048;
  } else {
    return bad('ไม่รู้จักคำขอนี้');
  }

  // A reply uses the free messages, then tokens; notes and drafts have their own daily cap.
  let release: () => Promise<void>;
  if (kind === 'chat') {
    const charge: Charge | Paywall = await chargeReply(user.id, plan, charId, body.payWithTokens === true);
    if ('code' in charge) return Response.json(charge, { status: 402 });
    release = () => refundReply(user.id, charge);
  } else {
    if (!(await reserveUsage(user.id, 'other', OTHER_PER_DAY))) return bad('วันนี้ใช้งาน AI ครบโควตาแล้ว ลองใหม่พรุ่งนี้', 429);
    release = () => releaseUsage(user.id, 'other');
  }

  const cf = await workersAi();
  if (cf) {
    // The plan picks the model; nothing from the browser does.
    const res = await workersAiChat(cf, plan.features.model || cf.model, messages, req.signal, maxTokens);
    if (!res.ok || !res.body) {
      await release();
      // The detail (already logged by workersAiChat) can name the account or model; the reader only needs to retry.
      return bad(res.status === 499 ? 'หยุดแล้ว' : 'AI ไม่ว่างชั่วคราว ลองส่งใหม่อีกครั้ง', res.status === 499 ? 499 : 502);
    }
    return new Response(res.body, { headers });
  }

  // Ollama: the deployed server pins OLLAMA_URL; only `next dev` may use a host and model from the browser.
  const host = resolveHost(body.host);
  const model = process.env.OLLAMA_MODEL?.trim() || (typeof body.model === 'string' ? body.model : '');
  if (!host || !model) {
    await release();
    return bad('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ AI', 503);
  }
  let res: Response;
  try {
    res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options: { temperature: 0.85, top_p: 0.95, num_predict: maxTokens } }),
      signal: req.signal,
    });
  } catch {
    await release();
    return bad(OFFLINE_HINT, 502);
  }
  if (!res.ok || !res.body) {
    await release();
    const notFound = res.status === 404 ? ` — ไม่พบโมเดล "${model}" ลองรัน ollama pull ${model}` : '';
    return bad(`Ollama ตอบกลับ HTTP ${res.status}${notFound}`, 502);
  }
  return new Response(res.body, { headers });
}
