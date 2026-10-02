import { requireMember } from '@/lib/server/auth';
import { getDb } from '@/lib/server/db';

export async function GET() {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const rows = getDb()
    .prepare('SELECT data FROM characters WHERE user_id = ? ORDER BY updated_at DESC')
    .all(user.id) as { data: string }[];
  return Response.json(rows.map((r) => JSON.parse(r.data)));
}
