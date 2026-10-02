import { listPlans } from '@/lib/billing';

/** Validates the admin's coupon form into column values, or returns what's wrong. */
export async function parseCoupon(b: Record<string, unknown>) {
  const kind = b.kind;
  if (kind !== 'percent' && kind !== 'amount' && kind !== 'free_days') return 'เลือกประเภทโค้ด';
  const value = Math.floor(Number(b.value) || 0);
  if (kind === 'percent' && (value < 1 || value > 100)) return 'ส่วนลดต้องอยู่ระหว่าง 1–100%';
  if (kind === 'amount' && value < 100) return 'ส่วนลดต้องอย่างน้อย ฿1';
  if (kind === 'free_days' && (value < 1 || value > 3650)) return 'จำนวนวันต้องอยู่ระหว่าง 1–3650';

  const known = new Set((await listPlans()).map((p) => p.id));
  const planIds = Array.isArray(b.planIds) ? b.planIds.filter((p): p is string => typeof p === 'string' && known.has(p)) : [];
  if (kind === 'free_days' && planIds.length !== 1) return 'โค้ดวันฟรีต้องเลือกแพ็กเกจที่จะให้ 1 แพ็กเกจ';

  const max = b.maxRedemptions === null || b.maxRedemptions === '' || b.maxRedemptions === undefined ? null : Math.floor(Number(b.maxRedemptions));
  if (max !== null && (!Number.isFinite(max) || max < 1)) return 'จำนวนคนที่ใช้ได้ต้องอย่างน้อย 1 หรือเว้นว่างไว้ถ้าไม่จำกัด';
  const expiresAt = typeof b.expiresAt === 'number' && b.expiresAt > 0 ? b.expiresAt : null;

  return {
    kind,
    value,
    duration: b.duration === 'forever' ? 'forever' : 'once',
    planIds: planIds.length ? planIds : null,
    maxRedemptions: max,
    expiresAt,
    active: b.active !== false,
    note: typeof b.note === 'string' ? b.note.slice(0, 200) : '',
  } as const;
}
