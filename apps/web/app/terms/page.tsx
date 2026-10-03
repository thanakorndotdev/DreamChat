import type { Metadata } from 'next';
import { connection } from 'next/server';
import LegalBody from '@longrak/shared/components/LegalBody';
import { LEGAL_TITLES, formatLegalDate } from '@longrak/shared/legal-docs';
import LegalPage, { legalInfo } from '@/components/LegalPage';
import { fetchLegal } from '@/lib/legal';

export const metadata: Metadata = { title: 'ข้อกำหนดการใช้งาน | หลงรักแชท' };

/** The text is edited on the admin's Legal tab (default in @longrak/shared/legal-docs). */
export default async function TermsPage() {
  await connection();
  const { body, updatedAt } = await fetchLegal('terms');
  return (
    <LegalPage title={LEGAL_TITLES.terms} updated={formatLegalDate(updatedAt)}>
      <LegalBody body={body} {...legalInfo()} />
    </LegalPage>
  );
}
