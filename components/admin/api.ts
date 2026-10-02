/** Fetches an admin endpoint and turns a non-OK reply into an Error carrying the server's message. */
export async function adminFetch<T = void>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  if (res.status === 204 || res.status === 201) return undefined as T;
  return res.json() as Promise<T>;
}

export const errorText = (err: unknown) => (err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ');

export function formatDate(ts: number) {
  return new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
