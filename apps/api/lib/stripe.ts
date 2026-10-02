import { createHmac, timingSafeEqual } from 'node:crypto';

/** Minimal Stripe REST client over fetch: just the calls membership billing needs. */

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY?.trim();
}

/** Stripe wants nested params as form fields: a[b][0][c]=1. */
function encode(params: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) value.forEach((v, i) => (typeof v === 'object' ? encode(v as Record<string, unknown>, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(v))));
    else if (typeof value === 'object') encode(value as Record<string, unknown>, name, out);
    else out.append(name, String(value));
  }
  return out;
}

export async function stripe<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, unknown> = {}): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('ยังไม่ได้ตั้งค่า STRIPE_SECRET_KEY');
  const body = encode(params);
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && body.size ? `?${body}` : ''}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    console.error(`[stripe] ${method} ${path}: ${res.status} ${data.error?.message ?? ''}`);
    throw new Error(`Stripe: ${data.error?.message ?? `HTTP ${res.status}`}`);
  }
  return data;
}

/** Checks the Stripe-Signature header (t=…,v1=…) against the raw body; rejects events older than 5 minutes. */
export function verifyWebhook(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest();
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const got = Buffer.from(p.slice(3), 'hex');
      return got.length === expected.length && timingSafeEqual(got, expected);
    });
}

/** The site's public origin for Stripe redirects. APP_URL wins; otherwise the request's own (forwarded) host. */
export function appUrl(req: Request) {
  const fixed = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (fixed) return fixed;
  const url = new URL(req.url);
  const proto = (req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')).split(',')[0].trim();
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  return `${proto}://${host}`;
}

export type StripeSubscription = {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  items?: { data: { current_period_end?: number }[] };
  metadata?: Record<string, string>;
};

/** Newer Stripe API versions moved the period end onto each subscription item. */
export function periodEnd(s: StripeSubscription): number {
  return (s.current_period_end ?? s.items?.data[0]?.current_period_end ?? 0) * 1000;
}
