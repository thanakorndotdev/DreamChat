import { db } from '@longrak/db';
import { DEFAULT_LEGAL, LEGAL_DOCS, type LegalDoc, type LegalDocId } from '@longrak/shared/legal-docs';

export const isLegalDoc = (s: string): s is LegalDocId => (LEGAL_DOCS as readonly string[]).includes(s);

const key = (doc: LegalDocId) => `legal_${doc}`;

/** The admin's text from the Legal tab, or the one shipped in code. */
export async function getLegal(doc: LegalDocId): Promise<LegalDoc & { edited: boolean }> {
  const sql = await db();
  const [row] = await sql<{ value: string }[]>`SELECT value FROM settings WHERE key = ${key(doc)}`;
  try {
    const saved = row ? (JSON.parse(row.value) as Partial<LegalDoc>) : null;
    if (saved && typeof saved.body === 'string' && typeof saved.updatedAt === 'number') return { body: saved.body, updatedAt: saved.updatedAt, edited: true };
  } catch {}
  return { ...DEFAULT_LEGAL[doc], edited: false };
}

/** Saves the text and stamps today's date on it; null goes back to the text in code. */
export async function setLegal(doc: LegalDocId, body: string | null) {
  const sql = await db();
  if (body === null) {
    await sql`DELETE FROM settings WHERE key = ${key(doc)}`;
    return;
  }
  const value = JSON.stringify({ body, updatedAt: Date.now() } satisfies LegalDoc);
  await sql`INSERT INTO settings (key, value) VALUES (${key(doc)}, ${value}) ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
}
