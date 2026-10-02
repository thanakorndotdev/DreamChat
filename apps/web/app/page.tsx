import type { Metadata } from 'next';
import { headers } from 'next/headers';
import LandingPage from '@/components/LandingPage';
import { apiUrl } from '@longrak/shared/forward';
import type { BillingState } from '@longrak/shared/api-types';

export const metadata: Metadata = {
  title: 'หลงรักแชท — เรื่องรักที่คุณเป็นคนเขียน',
  description: 'คุยกับตัวละคร AI สร้างตัวละครในแบบที่ชอบ และเขียนเรื่องราวของคุณเอง เริ่มต้นฟรี พร้อมเลือกแพ็กเกจที่เหมาะกับคุณ',
};

async function fromApi<T>(path: string, cookie?: string | null): Promise<T | null> {
  try {
    const response = await fetch(`${apiUrl()}${path}`, {
      cache: 'no-store',
      headers: cookie ? { cookie } : undefined,
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? await response.json() as T : null;
  } catch {
    // The introduction stays available when the api is temporarily unavailable.
    return null;
  }
}

export default async function Home() {
  // Reading the request headers also keeps this page dynamic, so prices and the signed-in name are always current.
  const cookie = (await headers()).get('cookie');
  const [billing, me] = await Promise.all([
    fromApi<BillingState>('/api/billing'),
    cookie ? fromApi<{ username: string | null }>('/api/auth/me', cookie) : null,
  ]);
  return <LandingPage plans={billing?.plans ?? null} payments={billing?.payments ?? false} username={me?.username ?? null} />;
}
