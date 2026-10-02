/** Bump when the privacy policy or terms change in a way people must accept again. */
export const CONSENT_VERSION = 1;

export const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Thai numbers: 0 followed by 8–9 digits (landline or mobile), or +66 instead of the 0. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '').replace(/^\+66/, '0');
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}
