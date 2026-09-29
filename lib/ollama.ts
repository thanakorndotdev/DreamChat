import { lexiconText } from './lexicon';
import type { Character, Message } from './types';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const SAFE_RULES = `5. Keep the language clean: no profanity, slurs, or sexual content. Stay in character while doing so.`;

const ADULT_RULES = () => `5. ADULT MODE (18+): This is a roleplay between adults; every character is 18 or older.
   Crude, rude, and vulgar Thai is allowed when it fits the character's personality and the mood — swear, curse, and use rough pronouns naturally like a real person would, not in every sentence.
   Mature and suggestive themes are allowed. Never involve minors.
   Vocabulary to draw from (use naturally, mix with your own):
${lexiconText()}`;

export function buildPrompt(char: Character, history: Message[]): ChatMessage[] {
  const system = `
You are an expert creative roleplay partner. You are roleplaying as "${char.name}".
Stay 100% in character at all times.

CHARACTER PROFILE:
- Name: ${char.name}
- Gender: ${char.gender || 'Not specified'}
- Age: ${char.age || 'Not specified'}
- Occupation: ${char.job || 'Not specified'}
- Concept/Role: ${char.role || 'Character'}
- Personality & Background:
${char.personality || 'Engaging roleplay character.'}

USER PROFILE (THE PERSON TALKING TO YOU):
- Name: ${char.userName || 'Not specified (address them as คุณ)'}
- Gender: ${char.userGender || 'Not specified'}
- Age: ${char.userAge || 'Not specified'}
- Occupation: ${char.userJob || 'Not specified'}
- Relationship Dynamic: ${char.userRole || 'Friend'}

ROLEPLAY RULES:
1. Always reply in fluent, natural Thai.
2. Put actions, movements, facial expressions, and inner feelings in asterisks *like this*.
3. Read the conversation history carefully. Directly acknowledge what ${char.userName || 'the user'} just said or asked.
4. Advance the scene naturally. Keep dialogue lively, emotional, and authentic.
${char.adult ? ADULT_RULES() : SAFE_RULES}
`.trim();

  return [
    { role: 'system', content: system },
    ...history
      .filter((m) => !m.failed)
      .slice(-10)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }) as ChatMessage),
  ];
}

/** Streams a reply through the Next.js proxy; calls onText with the text so far. */
export async function streamChat(
  opts: { host: string; model: string; messages: ChatMessage[]; signal?: AbortSignal; maxTokens?: number },
  onText: (text: string) => void,
): Promise<string> {
  const res = await fetch('/api/ollama/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: opts.host, model: opts.model, messages: opts.messages, maxTokens: opts.maxTokens }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);

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
  return out.trim();
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

const DRAFT_KEYS: (keyof CharacterDraft)[] = [
  'name',
  'role',
  'gender',
  'age',
  'job',
  'personality',
  'firstMessage',
  'userRole',
  'imagePrompt',
];

/** Asks the model to flesh out a rough outline into a full character sheet. */
export async function generateCharacter(
  opts: { host: string; model: string; outline: string; adult: boolean; signal?: AbortSignal },
  onProgress?: (chars: number) => void,
): Promise<CharacterDraft> {
  const system = `
You are a creative writer for a Thai roleplay chat app. Invent ONE original, vivid character from the user's outline.
If the outline is empty or vague, invent something surprising yourself; fill every gap with your own ideas and a compelling backstory.
${opts.adult ? 'This is an 18+ character: they and the user are adults (18 or older). Edgy, crude, or mature traits are allowed.' : 'Keep the character suitable for general audiences.'}

Reply with ONLY one JSON object — no markdown, no commentary — with exactly these string keys:
- "name": Thai name followed by a romanized name in parentheses, e.g. "ไอริส (Iris)"
- "role": short Thai concept/tagline (under 60 characters)
- "gender": exactly one of "หญิง", "ชาย", "อื่นๆ"
- "age": like "24 ปี"
- "job": Thai occupation or status
- "personality": Thai, 3–5 sentences covering personality, backstory, how they speak, and a secret or goal
- "firstMessage": Thai opening scene, 2–4 sentences, actions in *asterisks*, speaking directly to the user as "คุณ"
- "userRole": Thai, one sentence: who the user is to this character (the relationship and situation)
- "imagePrompt": English, comma-separated visual description of face, hair, outfit, and setting (no art-style words)
`.trim();

  const text = await streamChat(
    {
      host: opts.host,
      model: opts.model,
      maxTokens: 2048,
      signal: opts.signal,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Outline: ${opts.outline.trim() || '(none — surprise me)'}` },
      ],
    },
    (t) => onProgress?.(t.length),
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
