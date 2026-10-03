/**
 * Cloudflare Workers AI backend. When CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
 * are set, the AI route uses it when Ollama is not configured or fails, and translates its
 * SSE stream into Ollama's NDJSON shape, so the client code stays the same.
 */

import { getSetting } from './settings';

// Small, non-reasoning, ~7x fewer neurons per reply than SEA-LION 27B.
export const DEFAULT_CF_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

export type WorkersAi = { account: string; token: string; model: string; fallback: string };

export async function workersAi(): Promise<WorkersAi | null> {
  // Values saved on the admin page win over env.
  const account = (await getSetting('cf_account_id')) || process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = (await getSetting('cf_api_token')) || process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!account || !token) return null;
  const fallback = (await getSetting('cf_fallback_model')) || process.env.CLOUDFLARE_FALLBACK_MODEL?.trim() || DEFAULT_CF_MODEL;
  return { account, token, model: (await getSetting('cf_model')) || process.env.CLOUDFLARE_MODEL?.trim() || DEFAULT_CF_MODEL, fallback };
}

async function errorDetail(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '');
  try {
    const errs = (JSON.parse(raw) as { errors?: { message?: string }[] }).errors ?? [];
    return errs.map((e) => e.message ?? JSON.stringify(e)).join('; ') || raw.slice(0, 200);
  } catch {
    return raw.slice(0, 200);
  }
}

/** Rate limits, gateway errors and dropped connections usually clear up on a retry; 4xx request errors don't. */
const isTransient = (status: number) => status === 408 || status === 429 || status >= 500;

const RETRY_DELAYS_MS = [400, 1200];

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });
}

/** Model to fall back to when the chosen one keeps failing (partner-hosted models like Gemma 4 run out of capacity). */
function fallbackModel(cf: WorkersAi, model: string): string | null {
  return cf.fallback === 'none' || cf.fallback === model ? null : cf.fallback;
}

export async function workersAiChat(
  cf: WorkersAi,
  model: string,
  messages: unknown[],
  signal: AbortSignal,
  maxTokens = 1024,
): Promise<Response> {
  const body = JSON.stringify({
    messages,
    stream: true,
    max_tokens: maxTokens,
    temperature: 0.85,
    top_p: 0.95,
    // Gemma 4 thinks by default, burning tokens and delaying the reply; other models ignore this.
    chat_template_kwargs: { enable_thinking: false },
  });

  // Try the chosen model with backoff, then the fallback model once, before giving up.
  const fallback = fallbackModel(cf, model);
  const attempts = [...[0, ...RETRY_DELAYS_MS].map((delay) => ({ model, delay })), ...(fallback ? [{ model: fallback, delay: 0 }] : [])];

  let res: Response | null = null;
  let failure = '';
  for (const attempt of attempts) {
    if (attempt.delay) await sleep(attempt.delay, signal);
    if (signal.aborted) return new Response(null, { status: 499 });
    try {
      res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cf.account}/ai/run/${attempt.model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cf.token}`, 'Content-Type': 'application/json' },
        body,
        signal,
      });
    } catch (e) {
      if (signal.aborted) return new Response(null, { status: 499 });
      res = null;
      failure = 'เชื่อมต่อ Cloudflare Workers AI ไม่ได้';
      // undici hides the reason (EAI_AGAIN, ECONNRESET, ...) in `cause`.
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      console.error(`[workersAi] ${attempt.model}: network error: ${cause?.code ?? cause?.message ?? (e as Error).message}`);
      continue;
    }
    if (res.ok && res.body) break;
    failure = `Cloudflare AI ตอบกลับ HTTP ${res.status}: ${await errorDetail(res)}`;
    console.error(`[workersAi] ${attempt.model}: ${failure}`);
    if (!isTransient(res.status)) break;
  }
  if (!res?.ok || !res.body) return new Response(failure, { status: 502 });

  const encoder = new TextEncoder();
  let buffer = '';
  const toNdjson = new TransformStream<string, Uint8Array>({
    transform(text, controller) {
      buffer += text;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (!data || data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data) as {
            response?: string;
            choices?: { delta?: { content?: string } }[];
          };
          // Older models stream { response }, newer ones stream OpenAI-style deltas.
          const content = chunk.response || chunk.choices?.[0]?.delta?.content || '';
          if (content) controller.enqueue(encoder.encode(JSON.stringify({ message: { content } }) + '\n'));
        } catch {
          // skip keep-alives / partial frames
        }
      }
    },
  });

  return new Response(res.body.pipeThrough(new TextDecoderStream()).pipeThrough(toNdjson), {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
  });
}
