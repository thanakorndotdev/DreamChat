import type { Character, Message } from './types';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

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
- Name: ${char.userName || 'ผู้เล่น'}
- Gender: ${char.userGender || 'Not specified'}
- Age: ${char.userAge || 'Not specified'}
- Occupation: ${char.userJob || 'Not specified'}
- Relationship Dynamic: ${char.userRole || 'Friend'}

ROLEPLAY RULES:
1. Always reply in fluent, natural Thai.
2. Put actions, movements, facial expressions, and inner feelings in asterisks *like this*.
3. Read the conversation history carefully. Directly acknowledge what ${char.userName} just said or asked.
4. Advance the scene naturally. Keep dialogue lively, emotional, and authentic.
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
  opts: { host: string; model: string; messages: ChatMessage[]; signal?: AbortSignal },
  onText: (text: string) => void,
): Promise<string> {
  const res = await fetch('/api/ollama/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host: opts.host, model: opts.model, messages: opts.messages }),
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
