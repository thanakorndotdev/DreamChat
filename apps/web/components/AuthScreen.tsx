'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X } from '@phosphor-icons/react';
import { GUARDIAN_UNDER, ageFromBirthdate, todayTh } from '@longrak/shared/age';
import type { RegisterForm } from '@/lib/store';

type Mode = 'login' | 'register';

export default function AuthScreen({
  onSubmit,
  reason,
  onClose,
}: {
  onSubmit: (mode: Mode, form: RegisterForm) => Promise<void>;
  /** Why sign-in is needed right now, e.g. "เข้าสู่ระบบเพื่อเริ่มคุยกับไอริส". */
  reason?: string;
  /** Shown over the page with a close button when given; otherwise it's the whole page. */
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState<RegisterForm>({
    username: '',
    password: '',
    email: '',
    phone: '',
    birthdate: '',
    guardian: false,
    consent: false,
    marketing: false,
  });
  const age = ageFromBirthdate(form.birthdate);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof RegisterForm>(key: K, value: RegisterForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setConfirm('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) return setError('กรอกชื่อผู้ใช้และรหัสผ่าน');
    if (mode === 'register') {
      if (form.password !== confirm) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      if (!form.email.trim() || !form.phone.trim()) return setError('กรอกอีเมลและเบอร์โทร');
      if (age === null) return setError('กรอกวันเกิด');
      if (age < GUARDIAN_UNDER && !form.guardian) return setError('อายุต่ำกว่า 20 ปี ต้องให้ผู้ปกครองรับทราบและยินยอมก่อน');
      if (!form.consent) return setError('ติ๊กยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานก่อนสมัคร');
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(mode, { ...form, username: form.username.trim(), email: form.email.trim(), phone: form.phone.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <main
      className={onClose ? 'auth auth-overlay' : 'auth'}
      onMouseDown={onClose ? (e) => e.target === e.currentTarget && onClose() : undefined}
      role={onClose ? 'dialog' : undefined}
      aria-modal={onClose ? true : undefined}
      aria-label={onClose ? 'เข้าสู่ระบบ' : undefined}
    >
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-top">
          <p className="brand-mark">หลงรักแชท</p>
          {onClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="ปิด">
              <X size={18} weight="bold" />
            </button>
          )}
        </div>
        <p className="auth-lead">
          {reason ?? (mode === 'login' ? 'เข้าสู่ระบบเพื่ออ่านและเขียนเรื่องต่อกับตัวละครของคุณ' : 'สมัครบัญชี แชทของคุณเป็นความลับ เห็นได้เฉพาะคุณ')}
        </p>

        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => switchMode('login')}>
            เข้าสู่ระบบ
          </button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => switchMode('register')}>
            สมัครบัญชี
          </button>
        </div>

        <label className="field">
          <span className="field-label">ชื่อผู้ใช้</span>
          <input value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="username" autoFocus maxLength={32} />
          {mode === 'register' && <span className="help">3–32 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้</span>}
        </label>
        <label className="field">
          <span className="field-label">รหัสผ่าน</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && <span className="help">อย่างน้อย 8 ตัว</span>}
        </label>
        {mode === 'register' && (
          <>
            <label className="field">
              <span className="field-label">ยืนยันรหัสผ่าน</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="field">
              <span className="field-label">อีเมล</span>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" inputMode="email" />
              <span className="help">ใช้รับใบเสร็จและกู้บัญชี</span>
            </label>
            <label className="field">
              <span className="field-label">เบอร์โทร</span>
              <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" inputMode="tel" placeholder="0812345678" />
            </label>
            <BirthdateField
              value={form.birthdate}
              guardian={form.guardian}
              onChange={(v) => set('birthdate', v)}
              onGuardian={(v) => set('guardian', v)}
            />
            <ConsentChecks consent={form.consent} marketing={form.marketing} onChange={(k, v) => set(k, v)} />
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครและเริ่มใช้งาน'}
        </button>
      </form>
    </main>
  );
}

/** The two PDPA consents: the required one to use the service, and an optional one for news and offers. */
export function ConsentChecks({
  consent,
  marketing,
  onChange,
}: {
  consent: boolean;
  marketing: boolean;
  onChange: (key: 'consent' | 'marketing', value: boolean) => void;
}) {
  return (
    <div className="consent">
      <label className="consent-row">
        <input type="checkbox" checked={consent} onChange={(e) => onChange('consent', e.target.checked)} />
        <span>
          ฉันอ่านและยอมรับ{' '}
          <Link href="/privacy" target="_blank">
            นโยบายความเป็นส่วนตัว
          </Link>{' '}
          และ{' '}
          <Link href="/terms" target="_blank">
            ข้อกำหนดการใช้งาน
          </Link>{' '}
          และยินยอมให้เก็บและใช้ชื่อผู้ใช้ อีเมล และเบอร์โทรของฉันเพื่อให้บริการ <span className="req">(จำเป็น)</span>
        </span>
      </label>
      <label className="consent-row">
        <input type="checkbox" checked={marketing} onChange={(e) => onChange('marketing', e.target.checked)} />
        <span>ยินยอมรับข่าวสารและโปรโมชันทางอีเมลหรือ SMS (ไม่บังคับ ยกเลิกได้ทุกเมื่อ)</span>
      </label>
    </div>
  );
}

/** Real date of birth: decides 18+ mode, and asks for a guardian's consent under 20 (PDPA). */
export function BirthdateField({
  value,
  guardian,
  onChange,
  onGuardian,
}: {
  value: string;
  guardian: boolean;
  onChange: (v: string) => void;
  onGuardian: (v: boolean) => void;
}) {
  const age = ageFromBirthdate(value);
  return (
    <>
      <label className="field">
        <span className="field-label">วันเกิด</span>
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)} max={todayTh()} min="1900-01-01" autoComplete="bday" />
        <span className="help">
          {age === null
            ? 'ใช้วันเกิดจริง ระบบใช้เปิดโหมด 18+ และแก้เองภายหลังไม่ได้'
            : `อายุ ${age} ปี${age < 18 ? ' ใช้โหมด 18+ ไม่ได้' : ''}`}
        </span>
      </label>
      {age !== null && age < GUARDIAN_UNDER && (
        <label className="consent-row consent-guardian">
          <input type="checkbox" checked={guardian} onChange={(e) => onGuardian(e.target.checked)} />
          <span>
            ผู้ปกครองของฉันรับทราบและยินยอมให้ใช้บริการนี้ และให้เก็บข้อมูลตามนโยบายความเป็นส่วนตัว <span className="req">(จำเป็นสำหรับผู้ที่อายุต่ำกว่า 20 ปี)</span>
          </span>
        </label>
      )}
    </>
  );
}
