'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarCheck, Check, Coins, Crown } from '@phosphor-icons/react';
import type { BillingState } from '@longrak/shared/api-types';
import { useToast } from '@longrak/shared/components/Toast';
import { FREE_PLAN_ID, INTERVAL_LABEL, type Plan, formatPrice } from '@longrak/shared/plans';
import { formatTokens } from '@longrak/shared/tokens';
import AuthScreen from '@/components/AuthScreen';
import ConsentScreen from '@/components/ConsentScreen';
import SiteFooter from '@/components/SiteFooter';
import { useAuth } from '@/lib/store';

type Discount = { code: string; duration: 'once' | 'forever'; prices: Record<string, number> };

function limits(p: Plan) {
  const f = p.features;
  return [
    f.dailyMessages ? `คุยฟรี ${f.dailyMessages.toLocaleString('th-TH')} ข้อความต่อวัน` : 'ไม่จำกัดข้อความต่อวัน',
    ...(f.freePerCharacter ? [`ฟรี ${f.freePerCharacter} ข้อความต่อตัวละคร`] : []),
    ...(f.checkinTokens ? [`เช็คอินรับ ${f.checkinTokens.toLocaleString('th-TH')} โทเคน/วัน`] : []),
    `AI จำ ${f.historyWindow} ข้อความล่าสุด`,
    f.memoryNotes ? `ความจำระยะยาว ${f.memoryNotes} บันทึก` : 'ไม่มีความจำระยะยาว',
    f.maxCharacters ? `มีเรื่องได้ ${f.maxCharacters} เรื่อง` : 'มีเรื่องได้ไม่จำกัด',
  ];
}

const dateTh = (ts: number) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

export default function MembershipPage() {
  const auth = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [state, setState] = useState<BillingState | null | undefined>(undefined);
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [tokensPaid, setTokensPaid] = useState(false);
  const { toast, Toast } = useToast();

  const load = useCallback(
    () =>
      fetch('/api/billing')
        .then((r) => (r.ok ? (r.json() as Promise<BillingState>) : null))
        .then((s) => {
          setState(s);
          return s;
        })
        .catch(() => setState(null)),
    [],
  );

  useEffect(() => {
    load().then((s) => {
      // The section renders only once loaded, so the browser can't jump to #tokens on its own.
      if (s && location.hash === '#tokens') requestAnimationFrame(() => document.getElementById('tokens')?.scrollIntoView());
    });
    if (new URLSearchParams(location.search).get('tokens')) {
      setTokensPaid(true);
      // Card payments land within seconds; PromptPay can take a little longer.
      let tries = 0;
      const t = setInterval(() => {
        load();
        if (++tries >= 10) clearInterval(t);
      }, 3000);
      return () => clearInterval(t);
    }
    if (new URLSearchParams(location.search).get('paid')) {
      setPaid(true);
      // The webhook usually lands within seconds of the redirect; check a few times.
      let tries = 0;
      const t = setInterval(async () => {
        const s = await load();
        if ((s && s.plan.level > 0) || ++tries >= 10) clearInterval(t);
      }, 2000);
      return () => clearInterval(t);
    }
  }, [load, auth.me?.username, auth.me?.needsConsent]);

  const applyCode = async () => {
    if (state?.guest) return setLoginOpen(true);
    setCodeError(null);
    setBusy('code');
    try {
      const res = await fetch('/api/billing/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ({ kind: 'granted'; plan: string; until: number } | ({ kind: 'discount' } & Discount));
      if (data.kind === 'granted') {
        toast(`ใช้โค้ดแล้ว ได้ ${data.plan} ถึง ${dateTh(data.until)}`);
        setDiscount(null);
        setCode('');
        load();
      } else {
        setDiscount(data);
      }
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : 'ใช้โค้ดไม่สำเร็จ');
      setDiscount(null);
    } finally {
      setBusy(null);
    }
  };

  const go = async (path: string, body?: object, key = path) => {
    setBusy(key);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      if (!res.ok) throw new Error(await res.text());
      location.href = ((await res.json()) as { url: string }).url;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
      setBusy(null);
    }
  };

  const checkIn = async () => {
    setBusy('checkin');
    try {
      const res = await fetch('/api/tokens/checkin', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      toast(`เช็คอินแล้ว ได้ ${formatTokens(((await res.json()) as { granted: number }).granted)} โทเคน`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'เช็คอินไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  if (auth.me?.username && auth.me.needsConsent) {
    return <ConsentScreen username={auth.me.username} email={auth.me.email} phone={auth.me.phone} birthdate={auth.me.birthdate} guardianConsent={auth.me.guardianConsent} onSubmit={auth.consent} onLogout={auth.logout} />;
  }

  if (state === undefined) return <main className="admin-denied" aria-live="polite"><p>กำลังโหลดแพ็กเกจ…</p></main>;
  if (state === null) {
    return (
      <main className="admin-denied">
        <p className="empty-title">โหลดแพ็กเกจไม่สำเร็จ</p>
        <button className="btn btn-primary" onClick={load}>ลองอีกครั้ง</button>
        <Link className="link" href="/">กลับหน้าแรก</Link>
      </main>
    );
  }

  const sub = state.subscription?.live ? state.subscription : null;
  const viaStripe = sub?.source === 'stripe';
  const freePlan = state.plans.find((p) => p.id === FREE_PLAN_ID);
  const memberCheckin = Math.max(0, ...state.plans.filter((p) => p.price > 0).map((p) => p.features.checkinTokens));
  const { economy, tokens } = state;

  return (
    <div className="membership">
      <header className="topbar">
        <Link className="icon-btn" href="/chat" aria-label="กลับหน้าแชท">
          <ArrowLeft size={20} />
        </Link>
        <div className="brand">
          <Link className="brand-mark" href="/">หลงรักแชท</Link>
        </div>
      </header>

      <main className="membership-main">
        <h1 className="membership-title">เลือกแพ็กเกจที่ใช่สำหรับเรื่องของคุณ</h1>
        <p className="membership-now">
          {state.guest ? <>เลือกแพ็กเกจที่สนใจ แล้วเข้าสู่ระบบเพื่อสมัครหรือใช้โค้ด</> : <>ตอนนี้คุณใช้ <strong>{state.plan.name}</strong></>}
          {sub && (
            <>
              {' '}
              {sub.cancelAtPeriodEnd || !viaStripe ? 'ใช้ได้ถึง' : 'ต่ออายุอัตโนมัติวันที่'} {dateTh(sub.currentPeriodEnd)}
              {sub.status === 'past_due' && ' (ตัดบัตรไม่ผ่าน อัปเดตบัตรเพื่อใช้ต่อ)'}
            </>
          )}
          {!state.guest && state.plan.features.dailyMessages > 0 && `, วันนี้ใช้ข้อความฟรีไป ${state.usage.chat}/${state.plan.features.dailyMessages} ข้อความ`}
        </p>
        {paid && state.plan.level === 0 && <p className="settings-ok">ชำระเงินสำเร็จ กำลังเปิดใช้แพ็กเกจ รอสักครู่…</p>}

        <ul className="plans">
          {state.plans.map((p) => {
            const current = !state.guest && state.plan.id === p.id;
            const price = discount?.prices[p.id];
            return (
              <li key={p.id} id={`plan-${p.id}`} className="plan" data-level={p.level} data-current={current || undefined}>
                <h2 className="plan-name">
                  {p.level > 0 && <Crown size={18} weight="fill" aria-hidden />}
                  {p.name}
                </h2>
                <p className="plan-price">
                  {p.price === 0 ? (
                    'ฟรี'
                  ) : price !== undefined ? (
                    <>
                      <s>{formatPrice(p.price)}</s> {formatPrice(price)}
                      <span>/{INTERVAL_LABEL[p.interval]}</span>
                    </>
                  ) : (
                    <>
                      {formatPrice(p.price)}
                      <span>/{INTERVAL_LABEL[p.interval]}</span>
                    </>
                  )}
                </p>
                {price !== undefined && (
                  <p className="plan-note">
                    ราคาด้วยโค้ด {discount!.code}
                    {discount!.duration === 'once' ? ` เฉพาะรอบแรก จากนั้น ${formatPrice(p.price)}/${INTERVAL_LABEL[p.interval]}` : ' ทุกรอบ'}
                  </p>
                )}
                <ul className="plan-perks">
                  {p.perks.map((perk) => (
                    <li key={perk}>
                      <Check size={16} weight="bold" aria-hidden />
                      {perk}
                    </li>
                  ))}
                </ul>
                <p className="plan-limits">{limits(p).join(', ')}</p>
                <div className="plan-foot">
                  {state.guest ? (
                    <button className="btn btn-primary" onClick={() => setLoginOpen(true)}>
                      {p.price === 0 ? 'เข้าสู่ระบบเพื่อเริ่มใช้ฟรี' : 'เข้าสู่ระบบเพื่อเลือกแพ็กเกจ'}
                    </button>
                  ) : current ? (
                    <span className="plan-current">แพ็กเกจปัจจุบัน</span>
                  ) : p.price === 0 ? null : viaStripe ? (
                    <button className="btn btn-ghost" onClick={() => go('/api/billing/portal', {}, 'portal')} disabled={!!busy}>
                      เปลี่ยนเป็นแพ็กเกจนี้
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => go('/api/billing/checkout', { planId: p.id, code: discount ? discount.code : undefined }, p.id)}
                      disabled={!!busy || !state.payments}
                    >
                      {busy === p.id ? 'กำลังไปหน้าชำระเงิน…' : `สมัคร ${p.name}`}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {!state.payments && <p className="help membership-help">ยังไม่เปิดรับชำระเงินออนไลน์ ใช้โค้ดจากแอดมินได้ด้านล่าง</p>}

        <section className="tokens" id="tokens" aria-labelledby="tokens-heading">
          <div className="tokens-head">
            <div>
              <h2 id="tokens-heading" className="section-title">
                โทเคน
              </h2>
              <p className="help">
                {freePlan && (freePlan.features.dailyMessages || freePlan.features.freePerCharacter)
                  ? `คุยฟรีได้${freePlan.features.dailyMessages ? ` วันละ ${freePlan.features.dailyMessages} ข้อความ` : ''}${freePlan.features.freePerCharacter ? ` ตัวละครละ ${freePlan.features.freePerCharacter} ข้อความ` : ''} พอข้อความฟรีหมด `
                  : ''}
                ส่งต่อได้ข้อความละ {formatTokens(economy.messageCost)} โทเคน หรือปลดล็อกคุยไม่จำกัดกับตัวละครที่ชอบ {formatTokens(economy.unlockPrice)} โทเคน
                (บางตัวราคาต่างกัน)
                {memberCheckin > 0 && ` สมาชิกรายเดือนคุยได้ไม่จำกัดต่อวัน และเช็คอินรับ ${formatTokens(memberCheckin)} โทเคนทุกวัน`}
              </p>
            </div>
            {!state.guest && (
              <div className="tokens-balance">
                <span className="tokens-amount">
                  <Coins size={22} weight="fill" aria-hidden />
                  {formatTokens(tokens.balance)}
                </span>
                <span className="help">โทเคนของคุณ</span>
                {state.plan.features.checkinTokens > 0 &&
                  (tokens.checkedInToday ? (
                    <span className="help">วันนี้เช็คอินแล้ว</span>
                  ) : (
                    <button className="btn btn-primary" onClick={checkIn} disabled={!!busy}>
                      <CalendarCheck size={18} aria-hidden />
                      {busy === 'checkin' ? 'กำลังเช็คอิน…' : `เช็คอินรับ ${formatTokens(state.plan.features.checkinTokens)} โทเคน`}
                    </button>
                  ))}
              </div>
            )}
          </div>
          {tokensPaid && <p className="settings-ok">ชำระเงินสำเร็จ โทเคนจะเข้าบัญชีภายในไม่กี่วินาที</p>}
          {economy.packs.length > 0 && (
            <ul className="token-packs">
              {economy.packs.map((p) => (
                <li key={p.id} className="token-pack">
                  <p className="token-pack-amount">
                    <Coins size={20} weight="fill" aria-hidden />
                    {formatTokens(p.tokens)} <span>โทเคน</span>
                  </p>
                  <p className="token-pack-price">{formatPrice(p.price)}</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => (state.guest ? setLoginOpen(true) : go('/api/tokens/checkout', { packId: p.id }, `pack-${p.id}`))}
                    disabled={!!busy || (!state.guest && !state.payments)}
                  >
                    {busy === `pack-${p.id}` ? 'กำลังไปหน้าชำระเงิน…' : state.guest ? 'เข้าสู่ระบบเพื่อซื้อ' : 'ซื้อ'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="membership-row">
          <form
            className="code-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) applyCode();
            }}
          >
            <label className="field">
              <span className="field-label">มีโค้ดส่วนลดหรือโค้ดใช้ฟรี?</span>
              <span className="code-row">
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="เช่น RAKKAO50" autoComplete="off" />
                <button className="btn btn-soft" type="submit" disabled={busy === 'code' || !code.trim()}>
                  {busy === 'code' ? 'กำลังตรวจ…' : 'ใช้โค้ด'}
                </button>
              </span>
            </label>
            {codeError && (
              <p className="form-error" role="alert">
                {codeError}
              </p>
            )}
            {discount && <p className="settings-ok">ใช้โค้ด {discount.code} ได้ ราคาด้านบนเป็นราคาหลังหักส่วนลดแล้ว</p>}
          </form>

          {viaStripe && (
            <div className="manage">
              <p className="field-label">การชำระเงิน</p>
              <p className="help">เปลี่ยนบัตร ดูใบเสร็จ หรือยกเลิกการต่ออายุอัตโนมัติ ยกเลิกแล้วยังใช้ได้จนหมดรอบที่จ่ายไว้</p>
              <button className="btn btn-ghost" onClick={() => go('/api/billing/portal', {}, 'portal')} disabled={!!busy}>
                {busy === 'portal' ? 'กำลังเปิด…' : 'จัดการการชำระเงิน'}
              </button>
            </div>
          )}
        </section>

        <p className="help membership-help">
          แพ็กเกจแบบชำระเงินต่ออายุอัตโนมัติด้วยบัตรเครดิต/เดบิตจนกว่าจะยกเลิก แพ็กโทเคนจ่ายครั้งเดียว ไม่ต่ออายุ ชำระผ่าน Stripe เราไม่เก็บเลขบัตรของคุณ อ่าน{' '}
          <Link href="/terms">ข้อกำหนดการใช้งาน</Link>
        </p>
      </main>
      <SiteFooter />
      {loginOpen && state.guest && (
        <AuthScreen reason="เข้าสู่ระบบหรือสมัครบัญชีเพื่อเลือกแพ็กเกจและใช้โค้ด" onClose={() => setLoginOpen(false)} onSubmit={async (mode, form) => {
          await auth.submit(mode, form);
          setLoginOpen(false);
          await load();
        }} />
      )}
      <Toast />
    </div>
  );
}
