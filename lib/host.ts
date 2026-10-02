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
  if (process.env.OLLAMA_URL) return parseHost(process.env.OLLAMA_URL);
  // Only a local `next dev` may point at a host from the browser; a deployed server without OLLAMA_URL has no Ollama.
  return process.env.NODE_ENV === 'development' ? parseHost(raw) : null;
}

export const OFFLINE_HINT = 'ติดต่อเซิร์ฟเวอร์ AI ไม่ได้ ลองใหม่อีกครั้งในอีกสักครู่';
