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

/**
 * The Ollama base URL the server proxies to. When OLLAMA_URL is set (deployed),
 * it wins and the client-supplied host is ignored — otherwise the proxy would
 * fetch any URL a visitor sends (SSRF into the host's private network).
 */
export function resolveHost(raw: unknown): string | null {
  return process.env.OLLAMA_URL ? parseHost(process.env.OLLAMA_URL) : parseHost(raw);
}

export const OFFLINE_HINT = 'ติดต่อ Ollama ไม่ได้ เปิดโปรแกรม Ollama แล้วตรวจ Host URL ในหน้าตั้งค่า';
