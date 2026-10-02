import { getDb } from './db';
import type { CatalogEntry, CatalogStatus, CharacterSheet } from '../catalog';

type Row = {
  id: string;
  data: string;
  tier: number;
  status: CatalogStatus;
  review_note: string;
  author: string | null;
  source_id: string | null;
  updated_at: number;
  published_at: number | null;
};

const SELECT = `SELECT c.id, c.data, c.tier, c.status, c.review_note, c.source_id, c.updated_at, c.published_at, u.username AS author
  FROM catalog c LEFT JOIN users u ON u.id = c.author_id`;

function toEntry(r: Row): CatalogEntry {
  return {
    id: r.id,
    sheet: JSON.parse(r.data) as CharacterSheet,
    tier: r.tier,
    status: r.status,
    reviewNote: r.review_note,
    author: r.author,
    sourceId: r.source_id,
    updatedAt: r.updated_at,
    publishedAt: r.published_at,
  };
}

export function listCatalog(where = '', ...args: (string | number)[]): CatalogEntry[] {
  return (getDb().prepare(`${SELECT} ${where} ORDER BY c.updated_at DESC`).all(...args) as Row[]).map(toEntry);
}

export function getEntry(id: string): CatalogEntry | null {
  const r = getDb().prepare(`${SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
  return r ? toEntry(r) : null;
}
