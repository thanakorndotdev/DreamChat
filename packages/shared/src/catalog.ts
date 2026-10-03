import type { Character } from './types';

/** The public part of a character: what a catalog entry holds. Nothing about the player or the conversation. */
export type CharacterSheet = Pick<Character, 'name' | 'role' | 'gender' | 'age' | 'job' | 'avatar' | 'personality' | 'firstMessage' | 'userRole' | 'adult'>;

export const SHEET_KEYS = ['name', 'role', 'gender', 'age', 'job', 'avatar', 'personality', 'firstMessage', 'userRole', 'adult'] as const;

/**
 * Shown to every visitor, so only an embedded image, an https URL (no javascript:, no plain-http mixed content)
 * or one of the bundled faces in apps/web/public/characters.
 */
function safeImage(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(s) || /^https:\/\//i.test(s) || /^\/characters\/[a-z0-9-]+\.(jpg|webp)$/.test(s) ? s : '';
}

export function toSheet(c: Partial<Character>): CharacterSheet {
  return {
    name: String(c.name ?? '').slice(0, 120),
    role: String(c.role ?? '').slice(0, 200),
    gender: String(c.gender ?? '').slice(0, 40),
    age: String(c.age ?? '').slice(0, 40),
    job: String(c.job ?? '').slice(0, 120),
    avatar: safeImage(c.avatar),
    personality: String(c.personality ?? '').slice(0, 6000),
    firstMessage: String(c.firstMessage ?? '').slice(0, 3000),
    userRole: String(c.userRole ?? '').slice(0, 500),
    adult: !!c.adult,
  };
}

export type CatalogStatus = 'draft' | 'pending' | 'published' | 'rejected';

export type CatalogEntry = {
  id: string;
  sheet: CharacterSheet;
  tier: number;
  /** Tokens to unlock unlimited chat; null = the default price. */
  unlockPrice: number | null;
  status: CatalogStatus;
  reviewNote: string;
  author: string | null;
  sourceId: string | null;
  updatedAt: number;
  publishedAt: number | null;
};

export const STATUS_LABEL: Record<CatalogStatus, string> = {
  draft: 'ฉบับร่าง',
  pending: 'รอแอดมินตรวจ',
  published: 'เผยแพร่แล้ว',
  rejected: 'ไม่ผ่านการตรวจ',
};
