import type { Message } from './types';

/**
 * Browser side of the AI: names a task for /api/ai and streams the reply back. The prompts
 * themselves live on the server (lib/server/prompts.ts).
 */

/** Recent messages the chat screen sends with each reply; the server keeps only the plan's window of them. */
export const HISTORY_WINDOW = 10;

export type AiTask =
  | { task: 'reply'; characterId: string; history: Pick<Message, 'sender' | 'text'>[]; rude: boolean }
  | { task: 'note'; characterId: string }
  | { task: 'draft'; outline: string; adult: boolean };

/** The plan's limit was hit (daily messages, characters, premium); the message says which. */
export class LimitError extends Error {}

/** Streams the AI's answer; calls onText with the text so far. */
export async function streamAi(
  opts: AiTask & { host: string; model: string; signal?: AbortSignal },
  onText: (text: string) => void,
): Promise<{ text: string; headers: Headers }> {
  const { signal, ...body } = opts;
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = (await res.text()) || `HTTP ${res.status}`;
    throw res.status === 429 || res.status === 402 ? new LimitError(text) : new Error(text);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let out = '';

  const consume = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string };
    if (chunk.error) throw new Error(chunk.error);
    out += chunk.message?.content ?? '';
    onText(out);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(consume);
  }
  consume(buffer);
  return { text: out.trim(), headers: res.headers };
}

export type CharacterDraft = {
  name: string;
  role: string;
  gender: string;
  age: string;
  job: string;
  personality: string;
  firstMessage: string;
  userRole: string;
  imagePrompt: string;
};

const DRAFT_KEYS: (keyof CharacterDraft)[] = ['name', 'role', 'gender', 'age', 'job', 'personality', 'firstMessage', 'userRole', 'imagePrompt'];

/** Asks the AI to flesh out a rough outline into a full character sheet. `adult` needs an 18+ account. */
export async function generateCharacter(
  opts: { host: string; model: string; outline: string; adult: boolean; signal?: AbortSignal },
  onProgress?: (chars: number) => void,
): Promise<CharacterDraft> {
  const { text } = await streamAi({ task: 'draft', outline: opts.outline, adult: opts.adult, host: opts.host, model: opts.model, signal: opts.signal }, (t) =>
    onProgress?.(t.length),
  );

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI ตอบกลับมาไม่เป็นรูปแบบที่อ่านได้ ลองกดอีกครั้ง');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('AI ตอบกลับมาไม่ครบ ลองกดอีกครั้ง');
  }

  const draft = {} as CharacterDraft;
  for (const key of DRAFT_KEYS) draft[key] = typeof parsed[key] === 'string' ? (parsed[key] as string).trim() : '';
  if (!draft.name) throw new Error('AI ไม่ได้ตั้งชื่อตัวละครมา ลองกดอีกครั้ง');
  draft.gender = /หญิง|female|woman|girl/i.test(draft.gender)
    ? 'หญิง'
    : /ชาย|male|man|boy/i.test(draft.gender)
      ? 'ชาย'
      : 'อื่นๆ';
  return draft;
}
