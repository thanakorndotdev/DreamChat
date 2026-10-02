import { requireMember } from '@/lib/server/auth';
import { listCatalog } from '@/lib/server/catalog';

/** Published characters, for the lobby. */
export async function GET() {
  const user = await requireMember();
  if (user instanceof Response) return user;
  return Response.json(listCatalog("WHERE c.status = 'published'").map(({ reviewNote: _r, sourceId: _s, ...e }) => e));
}
