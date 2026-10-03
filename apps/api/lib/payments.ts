import { type Sql, db } from '@longrak/db';
import type { TransactionSql } from 'postgres';

export type Payment = { id: string; userId: number | null; kind: 'subscription' | 'tokens' | 'promptpay' | 'refund'; planId: string | null; amount: number };

/** Notes money received (or refunded) once, however many times Stripe reports it. Pass `tx` to join a transaction. */
export async function recordPayment(p: Payment, tx?: Sql | TransactionSql<{ bigint: number }>) {
  const sql = tx ?? (await db());
  if (!p.amount) return;
  await sql`
    INSERT INTO payments (id, user_id, kind, plan_id, amount, at)
    VALUES (${p.id}, ${p.userId}, ${p.kind}, ${p.planId}, ${p.amount}, ${Date.now()})
    ON CONFLICT (id) DO NOTHING`;
}
