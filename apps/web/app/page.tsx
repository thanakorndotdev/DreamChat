import type { Metadata } from 'next';
import { connection } from 'next/server';
import LandingPage from '@/components/LandingPage';
import { apiUrl } from '@longrak/shared/forward';
import type { BillingState } from '@longrak/shared/api-types';

export const metadata: Metadata = {
  title: 'หลงรักแชท — เรื่องรักที่คุณเป็นคนเขียน',
  description: 'คุยกับตัวละคร AI สร้างตัวละครในแบบที่ชอบ และเขียนเรื่องราวของคุณเอง เริ่มต้นฟรี พร้อมเลือกแพ็กเกจที่เหมาะกับคุณ',
};

export default async function Home() {
  await connection();
  let billing: BillingState | null = null;
  try {
    const response = await fetch(`${apiUrl()}/api/billing`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) billing = await response.json() as BillingState;
  } catch {
    // The introduction stays available when pricing is temporarily unavailable.
  }
  return <LandingPage plans={billing?.plans ?? null} payments={billing?.payments ?? false} />;
}
