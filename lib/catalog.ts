import type { Character } from './types';

/** The public part of a character: what a catalog entry holds. Nothing about the player or the conversation. */
export type CharacterSheet = Pick<Character, 'name' | 'role' | 'gender' | 'age' | 'job' | 'avatar' | 'personality' | 'firstMessage' | 'userRole' | 'adult'>;

export const SHEET_KEYS = ['name', 'role', 'gender', 'age', 'job', 'avatar', 'personality', 'firstMessage', 'userRole', 'adult'] as const;

export function toSheet(c: Partial<Character>): CharacterSheet {
  return {
    name: String(c.name ?? '').slice(0, 120),
    role: String(c.role ?? '').slice(0, 200),
    gender: String(c.gender ?? '').slice(0, 40),
    age: String(c.age ?? '').slice(0, 40),
    job: String(c.job ?? '').slice(0, 120),
    avatar: String(c.avatar ?? ''),
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
