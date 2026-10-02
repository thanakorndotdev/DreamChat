import { HISTORY_WINDOW, streamAi } from './ollama';
import type { Character, Message, StoryNote } from '@longrak/shared/types';

/** Jot a note once a full window (5 back-and-forths) is un-noted, so nothing leaves the window before it's noted. */
export const NOTE_EVERY = HISTORY_WINDOW;

/** Messages not yet covered by a note (failed replies never count). */
export function pendingMessages(char: Character): Message[] {
  return char.messages.filter((m) => !m.failed).slice(char.notedUpTo ?? 0);
}

/** Asks the AI to jot a few Thai bullet points of key story facts since the last note. */
export async function writeNote(opts: { host: string; model: string; char: Character; signal?: AbortSignal }): Promise<StoryNote | null> {
  const { text, headers } = await streamAi({ task: 'note', characterId: opts.char.id, host: opts.host, model: opts.model, signal: opts.signal }, () => {});
  // The server picks the stretch from the saved chat and says where it ends.
  const upTo = Number(headers.get('X-Note-Up-To'));
  if (!upTo) return null;

  // Keep the bullet lines; models sometimes add a heading or number them.
  const bullets = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-•]|\d+[.)])\s+/.test(l))
    .map((l) => '- ' + l.replace(/^([-•]|\d+[.)])\s+/, ''));
  const body = (bullets.length ? bullets.join('\n') : text.trim()).slice(0, 1200);
  if (!body) return null;
  return { text: body, upTo };
}
