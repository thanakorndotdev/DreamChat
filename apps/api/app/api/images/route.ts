import { requireMember } from '@/lib/auth';
import { effectivePlan, releaseUsage, reserveUsage, usageToday } from '@/lib/billing';
import { comfyImage } from '@/lib/comfyui';
import { unsafeImagePrompt } from '@/lib/imageSafety';
import { allow } from '@/lib/rateLimit';

/**
 * Draws one character picture on our GPU (ComfyUI + Flux.1), within the plan's pictures per day
 * and at the plan's quality.
 *
 *   { prompt }  → the image (PNG); header X-Images-Left is what remains today
 *
 * The browser sends only the description; the style and the safety wording are added here.
 */

const MAX_PROMPT = 600;

function buildPrompt(description: string) {
  return [
    `A portrait book-cover illustration of ${description
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.,\s]+$/, '')}.`,
    'The character is an adult in their twenties or older, fully clothed, upper body, looking at the viewer.',
    'Semi-realistic Korean webtoon style digital painting, beautiful detailed face and expressive eyes, soft warm cinematic lighting, gentle depth of field, clean softly blurred background, high detail, no text, no watermark.',
  ].join(' ');
}

const bad = (text: string, status = 400) => new Response(text, { status });

export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown };
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return bad('พิมพ์คำบรรยายภาพก่อน');
  if (prompt.length > MAX_PROMPT) return bad(`คำบรรยายยาวเกิน ${MAX_PROMPT} ตัวอักษร`);
  if (unsafeImagePrompt(prompt)) return bad('วาดภาพนี้ไม่ได้ ตัวละครในรูปต้องเป็นผู้ใหญ่และแต่งกายเหมาะสม ลองเปลี่ยนคำบรรยาย');

  const plan = await effectivePlan(user.id);
  const perDay = plan.features.dailyImages ?? 0;
  if (perDay <= 0) return bad('แพ็กเกจนี้ยังวาดภาพด้วย AI ไม่ได้ อัปเกรดเพื่อใช้งาน', 402);
  // One picture at a time per account is plenty; this stops a script from flooding the GPU queue.
  if (!(await allow(`image:${user.id}`, 6, 60_000))) return bad('สร้างภาพถี่เกินไป รอสักครู่แล้วลองใหม่', 429);
  if (!(await reserveUsage(user.id, 'image', perDay))) return bad(`วันนี้วาดภาพครบ ${perDay} รูปตามแพ็กเกจ ${plan.name} แล้ว ลองใหม่พรุ่งนี้หรืออัปเกรดแพ็กเกจ`, 429);

  const res = await comfyImage(buildPrompt(prompt), plan.features.imageQuality ?? 'standard', req.signal);
  if (!res.ok || !res.body) {
    await releaseUsage(user.id, 'image');
    return res.status === 499 ? bad('หยุดแล้ว', 499) : bad(await res.text(), 503);
  }
  const left = Math.max(0, perDay - (await usageToday(user.id)).image);
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/png',
      'Cache-Control': 'no-store',
      'X-Images-Left': String(left),
    },
  });
}
