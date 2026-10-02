'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RegisterForm } from '@/lib/store';

type Mode = 'login' | 'register';

export default function AuthScreen({ onSubmit }: { onSubmit: (mode: Mode, form: RegisterForm) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState<RegisterForm>({ username: '', password: '', email: '', phone: '', consent: false, marketing: false });
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
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <p className="brand-mark">หลงรักแชท</p>
        <p className="auth-lead">
          {mode === 'login' ? 'เข้าสู่ระบบเพื่ออ่านและเขียนเรื่องต่อกับตัวละครของคุณ' : 'สมัครบัญชี แชทของคุณเป็นความลับ เห็นได้เฉพาะคุณ'}
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
          {mode === 'register' && <span className="help">อย่างน้อย 6 ตัว</span>}
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
