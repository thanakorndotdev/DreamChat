import { BODY_MAX, type Report, type ReportContext, type ReportKind, TITLE_MAX } from '@longrak/shared/reports';
import { requireMember } from '@/lib/auth';
import { db } from '@longrak/db';
import { allow } from '@/lib/rateLimit';

const KINDS: ReportKind[] = ['bug', 'idea', 'other'];
/** A screenshot compressed in the browser is ~100–300 KB; this leaves headroom without letting the table balloon. */
const SCREENSHOT_MAX = 1_500_000;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replaceAll('\0', '').trim().slice(0, max) : '');

function parseContext(v: unknown): ReportContext | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  const out: ReportContext = {
    page: text(c.page, 300),
    userAgent: text(c.userAgent, 400),
    screen: text(c.screen, 40),
    language: text(c.language, 40),
    time: text(c.time, 40),
  };
  return Object.values(out).some(Boolean) ? out : null;
}

/** This account's reports, newest first, with the admins' replies. */
export async function GET() {
  const user = await requireMember();
  if (user instanceof Response) return user;
  const sql = await db();
  const rows = await sql<Omit<Report, 'author'>[]>`
    SELECT id, kind, title, body, NULL AS screenshot, context, status, admin_reply AS "adminReply",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM bug_reports WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`;
  return Response.json(rows);
}

export async function POST(req: Request) {
  const user = await requireMember();
  if (user instanceof Response) return user;
  if (!(await allow(`report:${user.id}`, 10, 60 * 60_000))) return new Response('ส่งรายงานบ่อยเกินไป รอสักพักแล้วลองใหม่', { status: 429 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = KINDS.includes(b.kind as ReportKind) ? (b.kind as ReportKind) : 'bug';
  const title = text(b.title, TITLE_MAX);
  const body = text(b.body, BODY_MAX);
  if (title.length < 3) return new Response('ใส่หัวข้ออย่างน้อย 3 ตัวอักษร', { status: 400 });
  if (body.length < 10) return new Response('เล่ารายละเอียดอย่างน้อย 10 ตัวอักษร จะช่วยให้แก้ได้เร็วขึ้น', { status: 400 });

  let screenshot: string | null = null;
  if (typeof b.screenshot === 'string' && b.screenshot) {
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.screenshot)) return new Response('ไฟล์รูปไม่ถูกต้อง', { status: 400 });
    if (b.screenshot.length > SCREENSHOT_MAX) return new Response('รูปใหญ่เกินไป', { status: 413 });
    screenshot = b.screenshot;
  }

  const context = parseContext(b.context);
  const now = Date.now();
  const sql = await db();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bug_reports (user_id, kind, title, body, screenshot, context, created_at, updated_at)
    VALUES (${user.id}, ${kind}, ${title}, ${body}, ${screenshot}, ${context ? sql.json(context) : null}, ${now}, ${now})
    RETURNING id`;
  return Response.json({ id: row.id });
}
