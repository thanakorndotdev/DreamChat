import type { Character } from './types';

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

/** First number in a free-text age like "20 ปี" or "๒๐ ปี"; null when there is none. */
export function ageNumber(age: string | undefined): number | null {
  const normalized = (age ?? '').replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  const m = normalized.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Why rude (18+) mode is blocked for this character, or null when it is allowed. Missing ages don't block. */
export function adultBlocker(c: Pick<Character, 'age' | 'userAge'>): string | null {
  const checks = [
    ['อายุตัวละคร', c.age],
    ['อายุของคุณ', c.userAge],
  ] as const;
  for (const [label, raw] of checks) {
    const n = ageNumber(raw);
    if (n !== null && n < 18) return `${label} "${raw}" อ่านได้เป็น ${n} ปี ต้อง 18 ปีขึ้นไป แก้อายุด้านล่างแล้วเปิดได้เลย`;
  }
  return null;
}
