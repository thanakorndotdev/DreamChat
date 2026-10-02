import { GUARDIAN_UNDER, ageFromBirthdate } from './age';

/** Bump when the privacy policy or terms change in a way people must accept again. */
export const CONSENT_VERSION = 1;

export const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Thai numbers: 0 followed by 8–9 digits (landline or mobile), or +66 instead of the 0. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '').replace(/^\+66/, '0');
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

/**
 * Checks a sign-up/consent birthdate. Returns the error to show, or null when it's fine.
 * `guardian` must be true for anyone under 20 (PDPA: minors need a guardian's consent).
 */
export function birthdateProblem(birthdate: unknown, guardian: unknown): string | null {
  const age = typeof birthdate === 'string' ? ageFromBirthdate(birthdate) : null;
  if (age === null) return 'วันเกิดไม่ถูกต้อง';
  if (age < GUARDIAN_UNDER && guardian !== true) return 'อายุต่ำกว่า 20 ปี ต้องให้ผู้ปกครองรับทราบและยินยอมก่อนใช้งาน';
  return null;
}
