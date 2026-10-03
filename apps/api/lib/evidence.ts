import { db } from '@longrak/db';
import { EVIDENCE_DAYS } from '@longrak/shared/legal-docs';

/** Copies past their EVIDENCE_DAYS go, as the privacy policy promises; run before every read and on sign-in. */
export async function purgeEvidence() {
  const sql = await db();
  await sql`DELETE FROM chat_evidence WHERE expires_at < ${Date.now()}`;
}

export const evidenceExpiry = (from: number) => from + EVIDENCE_DAYS * 86_400_000;
