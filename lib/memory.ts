import { HISTORY_WINDOW, streamChat } from './ollama';
import type { Character, Message, StoryNote } from './types';

/** Jot a note once a full window (5 back-and-forths) is un-noted, so nothing leaves the window before it's noted. */
export const NOTE_EVERY = HISTORY_WINDOW;
/** Most messages one note covers; a long chat from before notes existed is caught up in several notes. */
const MAX_CHUNK = 20;

/** Messages not yet covered by a note (failed replies never count). */
export function pendingMessages(char: Character): Message[] {
  return char.messages.filter((m) => !m.failed).slice(char.notedUpTo ?? 0);
}

/** Summarizes the messages since the last note into a few Thai bullet points of key story facts. */
export async function writeNote(opts: { host: string; model: string; char: Character; signal?: AbortSignal }): Promise<StoryNote | null> {
  const { char } = opts;
  const all = char.messages.filter((m) => !m.failed);
  const from = char.notedUpTo ?? 0;
  const chunk = all.slice(from, from + MAX_CHUNK);
  if (!chunk.length) return null;

  const user = char.userName || 'ผู้ใช้';
  const transcript = chunk.map((m) => `${m.sender === 'user' ? user : char.name}: ${m.text}`).join('\n\n');
  const earlier = (char.notes ?? []).slice(-3).map((n) => n.text).join('\n');

  const system = `
You keep the story notebook for a Thai roleplay between "${char.name}" and "${user}".
Read the new part of the conversation and write 2–5 short bullet points in Thai capturing ONLY what matters for continuity:
events that happened, decisions, promises, secrets revealed, names, places, items, and changes in feelings or relationship.
Each bullet starts with "- " and is one short sentence. Skip small talk. Do not repeat what the earlier notes already say.
Write as a neutral narrator (use the names, not "I/you"). Reply with the bullets only — no heading, no commentary.
`.trim();

  const text = await streamChat(
    {
      host: opts.host,
      model: opts.model,
      maxTokens: 400,
      signal: opts.signal,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${earlier ? `EARLIER NOTES:\n${earlier}\n\n` : ''}NEW CONVERSATION:\n${transcript}`,
        },
      ],
    },
    () => {},
  );

  // Keep the bullet lines; models sometimes add a heading or number them.
  const bullets = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-•]|\d+[.)])\s+/.test(l))
    .map((l) => '- ' + l.replace(/^([-•]|\d+[.)])\s+/, ''));
  const body = (bullets.length ? bullets.join('\n') : text.trim()).slice(0, 1200);
  if (!body) return null;
  return { text: body, upTo: from + chunk.length };
}
