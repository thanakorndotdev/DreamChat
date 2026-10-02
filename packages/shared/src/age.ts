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

/** Today in Thailand as YYYY-MM-DD; birthdays turn over at Bangkok midnight. */
export function todayTh(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

/** Whole years since a YYYY-MM-DD birthdate, or null when it isn't a real past date. */
export function ageFromBirthdate(birthdate: string | null | undefined, now = new Date()): number | null {
  const m = birthdate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const [ty, tm, td] = todayTh(now).split('-').map(Number);
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  return age >= 0 && age <= 120 ? age : null;
}

export const ADULT_AGE = 18;
/** Under the PDPA a person under 20 needs a guardian's consent. */
export const GUARDIAN_UNDER = 20;
