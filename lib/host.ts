/** Accepts only http(s) base URLs and strips a trailing slash. */
export function parseHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin + url.pathname.replace(/\/$/, '');
  } catch {
    return null;
  }
}

export const OFFLINE_HINT = 'ติดต่อ Ollama ไม่ได้ เปิดโปรแกรม Ollama แล้วตรวจ Host URL ในหน้าตั้งค่า';
