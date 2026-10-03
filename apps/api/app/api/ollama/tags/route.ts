import { OFFLINE_HINT, resolveHost } from '@/lib/host';
import { UNAUTHORIZED, currentUser } from '@/lib/auth';
import { workersAi } from '@/lib/workersAi';

/** Online when Ollama answers, or when Workers AI is set up to take over from it. */
export async function GET(req: Request) {
  if (!(await currentUser())) return UNAUTHORIZED();
  const host = resolveHost(new URL(req.url).searchParams.get('host'));

  let failure = 'Host URL ไม่ถูกต้อง';
  if (host) {
    try {
      const res = await fetch(`${host}/api/tags`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = (await res.json()) as { models?: { name: string }[] };
        return Response.json({ models: (data.models ?? []).map((m) => m.name) });
      }
      failure = `Ollama ตอบกลับ HTTP ${res.status}`;
    } catch {
      failure = OFFLINE_HINT;
    }
  }

  const cf = await workersAi();
  if (cf) return Response.json({ models: [cf.model] });
  return new Response(failure, { status: host ? 502 : 400 });
}
