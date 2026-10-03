/**
 * ComfyUI backend (our own GPU) drawing character pictures with Flux.1. The server pins COMFYUI_URL;
 * nothing from the browser picks the host, the model or the workflow.
 *
 *   COMFYUI_URL                  e.g. http://comfyui:8188; empty turns pictures off
 *   COMFYUI_FLUX_CHECKPOINT      all-in-one Flux.1 [schnell] checkpoint (default flux1-schnell-fp8.safetensors)
 *   COMFYUI_FLUX_DEV_CHECKPOINT  optional all-in-one Flux.1 [dev] checkpoint for the premium quality;
 *                                without it premium uses schnell at the larger size. [dev] needs a
 *                                commercial licence from Black Forest Labs for a paid service.
 */

import type { ImageQuality } from '@longrak/shared/plans';
import { parseHost } from './host';

/** The GPU queues jobs; past this the reader is told to try again. */
const TIMEOUT_MS = 180_000;
const POLL_MS = 1_000;

type Recipe = { ckpt: string; width: number; height: number; steps: number; guidance: number | null };

export function comfyUrl() {
  return process.env.COMFYUI_URL ? parseHost(process.env.COMFYUI_URL) : null;
}

function schnell() {
  return process.env.COMFYUI_FLUX_CHECKPOINT?.trim() || 'flux1-schnell-fp8.safetensors';
}

/** Portrait 3:4 for book covers. Schnell is distilled for 1–4 steps and ignores guidance; dev wants ~20–28 and guidance ~3.5. */
function recipe(quality: ImageQuality): Recipe {
  const dev = process.env.COMFYUI_FLUX_DEV_CHECKPOINT?.trim();
  if (quality === 'premium' && dev) return { ckpt: dev, width: 896, height: 1184, steps: 24, guidance: 3.5 };
  if (quality === 'premium') return { ckpt: schnell(), width: 896, height: 1184, steps: 4, guidance: null };
  if (quality === 'hd') return { ckpt: schnell(), width: 768, height: 1024, steps: 4, guidance: null };
  return { ckpt: schnell(), width: 576, height: 768, steps: 4, guidance: null };
}

/** ComfyUI's API-format workflow: checkpoint → prompt → (Flux guidance) → sampler → decode → preview. */
function workflow(prompt: string, quality: ImageQuality, seed: number) {
  const r = recipe(quality);
  const positive = r.guidance === null ? ['2', 0] : ['8', 0];
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: r.ckpt } },
    '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: prompt } },
    '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: '' } },
    '4': { class_type: 'EmptySD3LatentImage', inputs: { width: r.width, height: r.height, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: { model: ['1', 0], positive, negative: ['3', 0], latent_image: ['4', 0], seed, steps: r.steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'PreviewImage', inputs: { images: ['6', 0] } },
    ...(r.guidance === null ? {} : { '8': { class_type: 'FluxGuidance', inputs: { conditioning: ['2', 0], guidance: r.guidance } } }),
  };
}

type HistoryEntry = {
  status?: { status_str?: string; completed?: boolean; messages?: [string, { exception_message?: string }][] };
  outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
};

/** Waits, or rejects as soon as `signal` aborts; the listener is removed either way so polling doesn't pile them up. */
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => (clearTimeout(t), reject(signal.reason));
    const t = setTimeout(() => (signal.removeEventListener('abort', onAbort), resolve()), ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

/**
 * Queues one picture and waits for it. A failure comes back as a non-ok Response whose text is
 * safe to show the reader (499 when the reader stopped); the detail goes to the log.
 */
export async function comfyImage(prompt: string, quality: ImageQuality, signal: AbortSignal): Promise<Response> {
  const host = comfyUrl();
  if (!host) return new Response('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์วาดภาพ', { status: 503 });
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]);
  let promptId: string | undefined;
  try {
    const queued = await fetch(`${host}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow(prompt, quality, Math.floor(Math.random() * 2 ** 32)) }),
      signal: deadline,
    });
    if (!queued.ok) {
      // 400 here is usually a missing checkpoint: ComfyUI names it in node_errors.
      console.error(`[comfyui] queue: HTTP ${queued.status} ${(await queued.text()).slice(0, 500)}`);
      return new Response('เซิร์ฟเวอร์วาดภาพยังไม่พร้อม ลองใหม่อีกครั้ง', { status: 503 });
    }
    promptId = ((await queued.json()) as { prompt_id?: string }).prompt_id;
    if (!promptId) throw new Error('no prompt_id');

    for (;;) {
      await sleep(POLL_MS, deadline);
      const res = await fetch(`${host}/history/${promptId}`, { signal: deadline });
      if (!res.ok) continue;
      const entry = ((await res.json()) as Record<string, HistoryEntry>)[promptId];
      if (!entry) continue;
      if (entry.status?.status_str === 'error') {
        const why = entry.status.messages?.find(([kind]) => kind === 'execution_error')?.[1]?.exception_message;
        console.error(`[comfyui] ${promptId}: ${why ?? 'execution error'}`);
        return new Response('วาดภาพไม่สำเร็จ ลองใหม่อีกครั้ง', { status: 503 });
      }
      const image = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
      if (!image) continue;
      const params = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type });
      const file = await fetch(`${host}/view?${params}`, { signal: deadline });
      if (!file.ok || !file.body) throw new Error(`view HTTP ${file.status}`);
      // Served from our own origin, so never pass through a type the browser would run (text/html, SVG with script).
      const type = file.headers.get('content-type') ?? '';
      return new Response(file.body, { headers: { 'Content-Type': /^image\/(png|jpeg|webp)$/.test(type) ? type : 'image/png' } });
    }
  } catch (e) {
    // Leave the GPU free for the next reader: drop the job if it is still waiting or running.
    if (promptId) void cancel(host, promptId);
    if (signal.aborted) return new Response(null, { status: 499 });
    const cause = (e as { cause?: { code?: string } }).cause;
    console.error(`[comfyui] ${deadline.aborted ? `no picture within ${TIMEOUT_MS / 1000} s` : `network error: ${cause?.code ?? (e as Error).message}`}`);
    return new Response(deadline.aborted ? 'คิววาดภาพยาวอยู่ ลองใหม่อีกครั้งในอีกสักครู่' : 'ติดต่อเซิร์ฟเวอร์วาดภาพไม่ได้ ลองใหม่อีกครั้ง', { status: 503 });
  }
}

/**
 * Drops our job from the queue, and stops it only if it is the one running: an older ComfyUI ignores
 * prompt_id on /interrupt and would stop whichever reader's picture is on the GPU.
 */
async function cancel(host: string, promptId: string) {
  const post = (path: string, body: unknown) =>
    fetch(`${host}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  try {
    await post('/queue', { delete: [promptId] });
    const queue = (await (await fetch(`${host}/queue`, { signal: AbortSignal.timeout(5000) })).json()) as { queue_running?: unknown[][] };
    if (queue.queue_running?.some((job) => job[1] === promptId)) await post('/interrupt', { prompt_id: promptId });
  } catch {
    // The GPU is unreachable anyway; nothing to free.
  }
}

/** For the admin's settings page: whether the GPU answers. */
export async function comfyStatus(): Promise<{ url: boolean; online: boolean; checkpoints: { schnell: string; dev: string | null } }> {
  const host = comfyUrl();
  const checkpoints = { schnell: schnell(), dev: process.env.COMFYUI_FLUX_DEV_CHECKPOINT?.trim() || null };
  if (!host) return { url: false, online: false, checkpoints };
  const online = await fetch(`${host}/system_stats`, { signal: AbortSignal.timeout(3000) })
    .then((r) => r.ok)
    .catch(() => false);
  return { url: true, online, checkpoints };
}
