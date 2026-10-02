import { db } from './db';
import type { CatalogEntry, CatalogStatus, CharacterSheet } from '../catalog';

type Row = {
  id: string;
  data: CharacterSheet;
  tier: number;
  status: CatalogStatus;
  review_note: string;
  author: string | null;
  source_id: string | null;
  updated_at: number;
  published_at: number | null;
};

function toEntry(r: Row): CatalogEntry {
  return {
    id: r.id,
    sheet: r.data,
    tier: r.tier,
    status: r.status,
    reviewNote: r.review_note,
    author: r.author,
    sourceId: r.source_id,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
}

/** Catalog entries, newest first; narrow with `status` (published only, for the lobby) or `authorId` (one account's requests). */
export async function listCatalog(filter: { status?: CatalogStatus; authorId?: number } = {}): Promise<CatalogEntry[]> {
  const sql = await db();
  const rows = await sql<Row[]>`
    SELECT c.id, c.data, c.tier, c.status, c.review_note, c.source_id, c.updated_at, c.published_at, u.username AS author
    FROM catalog c LEFT JOIN users u ON u.id = c.author_id
    WHERE true
      ${filter.status ? sql`AND c.status = ${filter.status}` : sql``}
      ${filter.authorId !== undefined ? sql`AND c.author_id = ${filter.authorId}` : sql``}
    ORDER BY c.updated_at DESC`;
  return rows.map(toEntry);
}

export async function getEntry(id: string): Promise<CatalogEntry | null> {
  const sql = await db();
  const [r] = await sql<Row[]>`
    SELECT c.id, c.data, c.tier, c.status, c.review_note, c.source_id, c.updated_at, c.published_at, u.username AS author
    FROM catalog c LEFT JOIN users u ON u.id = c.author_id
    WHERE c.id = ${id}`;
  return r ? toEntry(r) : null;
}
