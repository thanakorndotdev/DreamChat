import { DEFAULT_LEGAL, type LegalDoc, type LegalDocId } from '@longrak/shared/legal-docs';
import { apiUrl } from '@longrak/shared/forward';

/** The text the admin saved on the Legal tab; the one in code when the API can't be reached. */
export async function fetchLegal(doc: LegalDocId): Promise<LegalDoc> {
  try {
    const res = await fetch(`${apiUrl()}/api/legal/${doc}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (res.ok) return (await res.json()) as LegalDoc;
    console.error(`[legal] ${doc}: HTTP ${res.status}`);
  } catch (e) {
    console.error(`[legal] ${doc}:`, (e as Error).message);
  }
  return DEFAULT_LEGAL[doc];
}
