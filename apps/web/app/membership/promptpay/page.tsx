'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle } from '@phosphor-icons/react';
import type { BillingState } from '@longrak/shared/api-types';
import { type Plan, formatPrice } from '@longrak/shared/plans';

type Payment = { id: string; planId: string; amount: number; status: 'pending' | 'paid' | 'canceled'; qr: string; testUrl: string | null };

const dateTh = (ts: number) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

/** Shows a Stripe PromptPay QR for one plan period and waits for the payment to land. */
export default function PromptPayPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [until, setUntil] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const params = useRef<{ plan: string; code: string | null }>({ plan: '', code: null });

  const create = useCallback(async (receiptEmail?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/promptpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: params.current.plan, code: params.current.code ?? undefined, email: receiptEmail }),
      });
      if (res.status === 422) {
        setNeedEmail(true);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setNeedEmail(false);
      setPayment((await res.json()) as Payment);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สร้าง QR ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    params.current = { plan: q.get('plan') ?? '', code: q.get('code') };
    fetch('/api/billing')
      .then((r) => (r.ok ? (r.json() as Promise<BillingState>) : null))
      .then((s) => setPlan(s?.plans.find((p) => p.id === params.current.plan) ?? null))
      .catch(() => {});
    create();
  }, [create]);

  // Poll until Stripe says it's paid (the webhook usually gets there first; this also catches up without it).
  const pending = payment?.status === 'pending';
  const id = payment?.id;
  useEffect(() => {
    if (!pending || !id) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/billing/promptpay/${encodeURIComponent(id)}`).catch(() => null);
      if (!res?.ok) return;
      const p = (await res.json()) as Payment;
      if (p.status === 'pending') return;
      setPayment(p);
      if (p.status === 'paid') {
        const s = (await fetch('/api/billing').then((r) => r.json())) as BillingState;
        setUntil(s.subscription?.currentPeriodEnd ?? null);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pending, id]);

  return (
    <div className="membership">
      <header className="topbar">
        <Link className="icon-btn" href="/membership" aria-label="กลับไปหน้าแพ็กเกจ">
          <ArrowLeft size={20} />
        </Link>
        <div className="brand">
          <span className="brand-mark">หลงรักแชท</span>
        </div>
      </header>

      <main className="promptpay-main">
        <section className="promptpay-card">
          <p className="promptpay-label">จ่ายด้วย QR PromptPay</p>
          <h1 className="promptpay-plan">{plan ? `${plan.name} ${plan.interval === 'year' ? '1 ปี' : '1 เดือน'}` : 'แพ็กเกจ'}</h1>
          {payment && <p className="promptpay-amount">{formatPrice(payment.amount)}</p>}

          {needEmail ? (
            <form
              className="promptpay-email"
              onSubmit={(e) => {
                e.preventDefault();
                if (email.trim()) create(email.trim());
              }}
            >
              <label className="field">
                <span className="field-label">อีเมลสำหรับรับใบเสร็จ</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </label>
              <p className="help">Stripe ต้องใช้อีเมลกับการจ่ายด้วย PromptPay ทุกครั้ง เราส่งต่อให้ Stripe เท่านั้น ไม่ได้บันทึกไว้ในบัญชี</p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? 'กำลังสร้าง QR…' : 'สร้าง QR'}
              </button>
            </form>
          ) : payment?.status === 'paid' ? (
            <div className="promptpay-done" role="status">
              <CheckCircle size={56} weight="fill" aria-hidden />
              <p className="promptpay-done-title">ชำระเงินสำเร็จ</p>
              <p className="help">{until ? `ใช้แพ็กเกจได้ถึง ${dateTh(until)}` : 'เปิดใช้แพ็กเกจแล้ว'}</p>
              <Link className="btn btn-primary" href="/">
                เริ่มคุยต่อ
              </Link>
            </div>
          ) : payment?.status === 'canceled' ? (
            <div className="promptpay-done">
              <p className="form-error" role="alert">
                QR นี้หมดอายุหรือถูกยกเลิกแล้ว
              </p>
              <button className="btn btn-primary" onClick={() => create()} disabled={busy}>
                {busy ? 'กำลังสร้าง QR…' : 'สร้าง QR ใหม่'}
              </button>
            </div>
          ) : payment ? (
            <>
              <img className="promptpay-qr" src={payment.qr} alt={`QR PromptPay ยอด ${formatPrice(payment.amount)}`} width={260} height={260} />
              <ol className="promptpay-steps">
                <li>เปิดแอปธนาคาร แล้วเลือกสแกนจ่าย</li>
                <li>สแกน QR นี้ หรือบันทึกรูปแล้วเลือกจากอัลบั้ม</li>
                <li>ตรวจยอดให้ตรง แล้วยืนยันการจ่าย</li>
              </ol>
              <p className="promptpay-wait" aria-live="polite">
                <span className="promptpay-dot" aria-hidden />
                รอการชำระเงิน หน้านี้จะอัปเดตเองเมื่อจ่ายแล้ว
              </p>
              <a className="btn btn-ghost" href={payment.qr} target="_blank" rel="noreferrer">
                เปิดรูป QR เพื่อบันทึก
              </a>
              {payment.testUrl && (
                <a className="btn btn-soft" href={payment.testUrl} target="_blank" rel="noreferrer">
                  โหมดทดสอบ: จำลองการจ่าย
                </a>
              )}
            </>
          ) : error ? (
            <div className="promptpay-done">
              <p className="form-error" role="alert">
                {error}
              </p>
              <Link className="btn btn-ghost" href="/membership">
                กลับไปหน้าแพ็กเกจ
              </Link>
            </div>
          ) : (
            <p className="help">กำลังสร้าง QR…</p>
          )}
        </section>
        <p className="help membership-help">
          จ่ายครั้งเดียวได้ 1 รอบ{plan ? ` (${plan.interval === 'year' ? '365' : '30'} วัน)` : ''} ไม่ต่ออายุอัตโนมัติ ถ้ายังมีวันเหลือในแพ็กเกจเดียวกันจะต่อท้ายให้
          ชำระผ่าน Stripe
        </p>
      </main>
    </div>
  );
}
