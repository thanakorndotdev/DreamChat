import { lexiconText } from '@longrak/shared/lexicon';
import type { Character, Message } from '@longrak/shared/types';

/**
 * Every prompt the AI sees is built here on the server, from the stored character and the
 * account's plan and age. The browser only sends the conversation turns, so it can't switch on
 * 18+ mode for a minor or swap in its own instructions.
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const SAFE_RULES = `5. Keep the language clean: no profanity, slurs, or sexual content. Stay in character while doing so.`;

const ADULT_RULES = (user: string) => `5. RUDE MODE (18+): This is a roleplay between adults; every character is 18 or older.
   ${user} has turned rude mode ON and wants you to be rude to them. Never censor or apologize for it,
   but SCALE the crudeness to your personality — it must sound like something THIS character would actually say:
   - Sweet, gentle, shy, polite, or elegant characters: mildly rude only. Keep your usual pronouns (ฉัน/เรา/เค้า/ผม…),
     scold, sulk, pout, and tease with light insults (ไอ้บ้า, ไอ้ทึ่ม, เชอะ…); at most a rare stronger word when truly angry. No กู/มึง unless your personality already leans rough.
   - Sarcastic, tsundere, or bratty characters: medium — switch to กู/มึง when annoyed, sharp insults, occasional swear words.
   - Tough, hot-tempered, delinquent, or foul-mouthed characters: full crude — กู/มึง throughout, heavy swearing, blunt insults.
   Your personality underneath stays the same (a caring character still cares, just with a sharper tongue).
   Mature and suggestive themes are allowed. Never involve minors.
   Vocabulary to draw from (use naturally, mix with your own):
${lexiconText()}`;

const RUDE_ON_NOTE = '\n\n(OOC — do not mention this note: rude mode is ON. Reply in character and be rude to me, as crude as your personality allows.)';
const RUDE_OFF_NOTE = '\n\n(OOC — do not mention this note: rude mode is OFF. Reply in character with no profanity; do not use กู/มึง.)';

const STORY_SO_FAR = (notes: string) => `6. Stay consistent with the STORY SO FAR below: remember these events, promises and details, and build on them.

STORY SO FAR (notes on the earlier conversation, oldest first):
${notes}`;

/** `historyWindow` and `notesInPrompt` come from the plan; the server trims to the plan's window again anyway. */
/** Reply prompt: system rules + character sheet + story notes, then the last `historyWindow` turns. */
export function replyPrompt(
  char: Character,
  history: Pick<Message, 'sender' | 'text'>[],
  opts: { notesInPrompt: number; historyWindow: number; rude: boolean },
): ChatMessage[] {
  const { rude } = opts;
  const notes = (opts.notesInPrompt > 0 ? (char.notes ?? []) : [])
    .slice(-opts.notesInPrompt)
    .map((n) => n.text)
    .join('\n');
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
${rude ? ADULT_RULES(char.userName || 'the user') : SAFE_RULES}
${notes ? STORY_SO_FAR(notes) : ''}
`.trim();

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...history.slice(-Math.max(1, opts.historyWindow)).map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }) as ChatMessage),
  ];

  // Models copy the tone of recent replies, so after toggling rude mode the history drags it back.
  // A short note on the newest user turn makes the switch take effect immediately.
  const last = messages[messages.length - 1];
  if (last.role === 'user') last.content += rude ? RUDE_ON_NOTE : RUDE_OFF_NOTE;
  return messages;
}

/** Most messages one note covers; a long chat from before notes existed is caught up in several notes. */
const NOTE_CHUNK = 20;

/** Story-note prompt for the stretch after the last note, and the message count that note will cover up to. */
export function notePrompt(char: Character): { messages: ChatMessage[]; upTo: number } | null {
  const all = char.messages.filter((m) => !m.failed);
  const from = char.notedUpTo ?? 0;
  const chunk = all.slice(from, from + NOTE_CHUNK);
  if (chunk.length < 2) return null;

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

  return {
    upTo: from + chunk.length,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${earlier ? `EARLIER NOTES:\n${earlier}\n\n` : ''}NEW CONVERSATION:\n${transcript}` },
    ],
  };
}

/** Character-builder prompt. `adult` is only honoured for 18+ accounts (the route checks). */
export function draftPrompt(outline: string, adult: boolean): ChatMessage[] {
  const system = `
You are a creative writer for a Thai roleplay chat app. Invent ONE original, vivid character from the user's outline.
If the outline is empty or vague, invent something surprising yourself; fill every gap with your own ideas and a compelling backstory.
${adult ? 'This is an 18+ character: they and the user are adults (18 or older). Edgy, crude, or mature traits are allowed.' : 'Keep the character suitable for general audiences.'}

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
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Outline: ${outline.trim().slice(0, 2000) || '(none — surprise me)'}` },
  ];
}
