/** Sent with every page and API response by all three apps. */
export const SECURITY_HEADERS = [
  // Nobody may frame the site (clickjacking on the payment or admin pages).
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Browsers only honour this over HTTPS (the Cloudflare tunnel); harmless on plain-HTTP ports.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];
