import { requireAdmin } from '@/lib/server/auth';
import { SETTING_KEYS, type SettingKey, getSetting, setSetting } from '@/lib/server/settings';
import { DEFAULT_CF_MODEL, workersAi, workersAiChat } from '@/lib/workersAi';

export type AdminSettings = {
  cf_account_id: string;
  /** Never sent back; only whether one is saved here or in env. */
  cf_api_token_set: 'admin' | 'env' | null;
  cf_model: string;
  cf_fallback_model: string;
  /** What the server actually uses right now. */
  active: { backend: 'workers-ai' | 'ollama'; model: string | null };
  env: { cf_account_id: string; cf_model: string; cf_fallback_model: string; default_model: string };
  stripe: { secretKey: 'live' | 'test' | null; webhook: boolean; appUrl: string };
};

function snapshot(): AdminSettings {
  const cf = workersAi();
  return {
    cf_account_id: getSetting('cf_account_id') ?? '',
    cf_api_token_set: getSetting('cf_api_token') ? 'admin' : process.env.CLOUDFLARE_API_TOKEN?.trim() ? 'env' : null,
    cf_model: getSetting('cf_model') ?? '',
    cf_fallback_model: getSetting('cf_fallback_model') ?? '',
    active: cf ? { backend: 'workers-ai', model: cf.model } : { backend: 'ollama', model: null },
    env: {
      cf_account_id: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '',
      cf_model: process.env.CLOUDFLARE_MODEL?.trim() ?? '',
      cf_fallback_model: process.env.CLOUDFLARE_FALLBACK_MODEL?.trim() ?? '',
      default_model: DEFAULT_CF_MODEL,
    },
    stripe: {
      secretKey: !process.env.STRIPE_SECRET_KEY?.trim() ? null : process.env.STRIPE_SECRET_KEY.trim().startsWith('sk_live') ? 'live' : 'test',
      webhook: !!process.env.STRIPE_WEBHOOK_SECRET?.trim(),
      appUrl: process.env.APP_URL?.trim() ?? '',
    },
  };
}

export async function GET() {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  return Response.json(snapshot());
}

/** Keys left out are untouched; an empty string clears the override. */
export async function PUT(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const body = (await req.json().catch(() => ({}))) as Partial<Record<SettingKey, unknown>>;
  for (const key of SETTING_KEYS) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') return new Response(`${key} ต้องเป็นข้อความ`, { status: 400 });
    setSetting(key, value);
  }
  return Response.json(snapshot());
}

/** Sends one short message through the current backend so the admin can see the connection works. */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (me instanceof Response) return me;
  const cf = workersAi();
  if (!cf) return new Response('ยังไม่ได้ตั้งค่า Workers AI ต้องมีทั้ง Account ID และ API token', { status: 400 });

  const started = Date.now();
  const res = await workersAiChat(cf, cf.model, [{ role: 'user', content: 'ตอบสั้นๆ ว่า "เชื่อมต่อแล้ว"' }], req.signal, 32);
  if (!res.ok || !res.body) return new Response(await res.text(), { status: 502 });

  let reply = '';
  for (const line of (await res.text()).split('\n')) {
    try {
      reply += (JSON.parse(line) as { message?: { content?: string } }).message?.content ?? '';
    } catch {}
  }
  return Response.json({ model: cf.model, reply: reply.trim(), ms: Date.now() - started });
}
