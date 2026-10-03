/**
 * Ollama backend (the local GPU). The AI route tries it first and hands the reply to
 * Workers AI when it is down, busy or missing the model.
 */

import { OFFLINE_HINT } from './host';

/** A cold model load takes ~20 s; past this the local GPU counts as busy and Workers AI takes the reply. */
const FIRST_BYTE_MS = 45_000;

/**
 * Like workersAiChat, a failure comes back as a non-ok Response (499 when the reader stopped)
 * whose text is safe to show the reader; the detail goes to the log.
 */
export async function ollamaChat(
  host: string,
  model: string,
  messages: unknown[],
  signal: AbortSignal,
  maxTokens = 1024,
): Promise<Response> {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  signal.addEventListener('abort', stop, { once: true });
  // Only until the reply starts; a long reply may take longer to finish.
  const timer = setTimeout(stop, FIRST_BYTE_MS);
  try {
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // think: false — thinking models (Qwen 3.6) otherwise spend num_predict on reasoning the reader never sees.
      body: JSON.stringify({ model, messages, stream: true, think: false, options: { temperature: 0.85, top_p: 0.95, num_predict: maxTokens } }),
      signal: ctrl.signal,
    });
    if (res.ok && res.body) return res;
    console.error(`[ollama] ${model}: HTTP ${res.status}`);
    const notFound = res.status === 404 ? ` — ไม่พบโมเดล "${model}" ลองรัน ollama pull ${model}` : '';
    return new Response(`Ollama ตอบกลับ HTTP ${res.status}${notFound}`, { status: 503 });
  } catch (e) {
    if (signal.aborted) return new Response(null, { status: 499 });
    // undici hides the reason (ENOTFOUND, ECONNREFUSED, ...) in `cause`.
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    const why = ctrl.signal.aborted ? `no answer within ${FIRST_BYTE_MS / 1000} s` : `network error: ${cause?.code ?? cause?.message ?? (e as Error).message}`;
    console.error(`[ollama] ${model}: ${why}`);
    return new Response(OFFLINE_HINT, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
