import { requireMember } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

export async function GET() {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const sql = await db();
  const rows = await sql<{ data: unknown }[]>`SELECT data FROM characters WHERE user_id = ${user.id} ORDER BY updated_at DESC`;
  return Response.json(rows.map((r) => r.data));
}
