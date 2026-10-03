/**
 * Character pictures drawn by Cloudflare Workers AI with FLUX.2 [klein] 4B, on the same account and
 * token as the chat fallback (lib/workersAi.ts). The server picks the model and the size; the browser
 * only sends the description.
 *
 *   CLOUDFLARE_IMAGE_MODEL  optional, a FLUX.2 model (they take multipart input). Default @cf/black-forest-labs/flux-2-klein-4b:
 *                           ~80–110 neurons a picture, so the free 10,000 neurons a day cover about a hundred.
 *                           flux-2-klein-9b draws a little better but costs ~1,400 neurons a picture.
 */

import type { ImageQuality } from '@longrak/shared/plans';
import { workersAi } from './workersAi';

export const DEFAULT_IMAGE_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

// Cloudflare's queue for the model varies: 12 s on a quiet minute, over a minute when busy.
// The web app's proxy waits 200 s (apps/web/next.config.ts).
const TIMEOUT_MS = 170_000;

export function imageModel() {
  return process.env.CLOUDFLARE_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

/** Portrait 3:4 for book covers; quality is the size. */
const SIZE: Record<ImageQuality, { width: number; height: number }> = {
  standard: { width: 576, height: 768 },
  hd: { width: 768, height: 1024 },
  premium: { width: 896, height: 1184 },
};

const fail = (text: string) => new Response(text, { status: 503 });

/** Draws one picture: the image (JPEG) on success, or a 503 with a message to show, or 499 when cancelled. */
export async function workersAiImage(prompt: string, quality: ImageQuality, signal: AbortSignal): Promise<Response> {
  const cf = await workersAi();
  if (!cf) return fail('ยังไม่ได้ตั้งค่า Cloudflare Workers AI จึงวาดภาพด้วย AI ไม่ได้');
  const model = imageModel();
  const { width, height } = SIZE[quality] ?? SIZE.standard;
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]);

  // A busy model answers 429/5xx now and then; one more try usually gets through.
  let status = 0;
  for (const attempt of [1, 2]) {
    const form = new FormData();
    form.set('prompt', prompt);
    form.set('width', String(width));
    form.set('height', String(height));
    form.set('seed', String(Math.floor(Math.random() * 2 ** 31)));
    let res: Response;
    try {
      res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cf.account}/ai/run/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cf.token}` },
        body: form,
        signal: deadline,
      });
    } catch (e) {
      if (signal.aborted) return new Response(null, { status: 499 });
      const cause = (e as { cause?: { code?: string } }).cause;
      console.error(`[workersAiImage] ${model}: ${deadline.aborted ? `no picture within ${TIMEOUT_MS / 1000} s` : `network error: ${cause?.code ?? (e as Error).message}`}`);
      return fail(deadline.aborted ? 'วาดภาพนานเกินไป ลองใหม่อีกครั้ง' : 'เชื่อมต่อ Cloudflare Workers AI ไม่ได้ ลองใหม่อีกครั้ง');
    }

    const raw = await res.text().catch(() => '');
    if (res.ok) {
      const image = (JSON.parse(raw) as { result?: { image?: string } }).result?.image;
      if (image) return new Response(Buffer.from(image, 'base64'), { headers: { 'Content-Type': 'image/jpeg' } });
      console.error(`[workersAiImage] ${model}: no image in the reply`);
      return fail('วาดภาพไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
    console.error(`[workersAiImage] ${model}: HTTP ${res.status} ${raw.slice(0, 300)}`);
    status = res.status;
    // Content filter or a bad request: retrying won't help.
    if (status < 500 && status !== 429) break;
    if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
  }
  if (status === 429) return fail('ตอนนี้มีคนวาดภาพเยอะ หรือโควตาวาดภาพวันนี้หมดแล้ว ลองใหม่ภายหลัง');
  return fail(status < 500 ? 'วาดภาพนี้ไม่ได้ ลองเปลี่ยนคำบรรยายแล้ววาดใหม่' : 'เซิร์ฟเวอร์วาดภาพไม่ว่าง ลองใหม่อีกครั้ง');
}

/** For the admin's settings page: whether pictures can be drawn, and with which model. */
export async function imageStatus(): Promise<{ ready: boolean; model: string }> {
  return { ready: !!(await workersAi()), model: imageModel() };
}
