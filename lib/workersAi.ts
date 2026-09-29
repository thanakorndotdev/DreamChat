/**
 * Cloudflare Workers AI backend. When CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN
 * are set, the API routes use it instead of Ollama and translate its SSE stream into
 * Ollama's NDJSON shape, so the client code stays the same.
 */

// Small, non-reasoning, ~7x fewer neurons per reply than SEA-LION 27B.
const DEFAULT_CF_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

export type WorkersAi = { account: string; token: string; model: string };

export function workersAi(): WorkersAi | null {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!account || !token) return null;
  return { account, token, model: process.env.CLOUDFLARE_MODEL?.trim() || DEFAULT_CF_MODEL };
}

/** Ollama model names (e.g. llama3.1:8b) mean nothing here, so fall back to the configured model. */
export function pickModel(cf: WorkersAi, requested: string): string {
  return /^@(cf|hf)\//.test(requested) ? requested : cf.model;
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

export async function workersAiChat(
  cf: WorkersAi,
  model: string,
  messages: unknown[],
  signal: AbortSignal,
  maxTokens = 1024,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cf.account}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cf.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature: 0.85,
        top_p: 0.95,
        // Gemma 4 thinks by default, burning tokens and delaying the reply; other models ignore this.
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal,
    });
  } catch {
    return new Response('เชื่อมต่อ Cloudflare Workers AI ไม่ได้', { status: 502 });
  }
  if (!res.ok || !res.body) {
    return new Response(`Cloudflare AI ตอบกลับ HTTP ${res.status}: ${await errorDetail(res)}`, { status: 502 });
  }

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
