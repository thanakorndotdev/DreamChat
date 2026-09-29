'use client';

import { useState } from 'react';

type Mode = 'login' | 'register';

export default function AuthScreen({ onSubmit }: { onSubmit: (mode: Mode, username: string, password: string) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setConfirm('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setError('กรอกชื่อผู้ใช้และรหัสผ่าน');
    if (mode === 'register' && password !== confirm) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    setError(null);
    try {
      await onSubmit(mode, username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <p className="brand-mark">Dream Chat</p>
        <p className="auth-lead">
          {mode === 'login' ? 'เข้าสู่ระบบเพื่อคุยต่อกับตัวละครของคุณ' : 'สมัครบัญชี ตัวละครและประวัติแชทจะเก็บไว้ในบัญชีนี้'}
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
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            maxLength={32}
          />
          {mode === 'register' && <span className="help">3–32 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้</span>}
        </label>
        <label className="field">
          <span className="field-label">รหัสผ่าน</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && <span className="help">อย่างน้อย 6 ตัว</span>}
        </label>
        {mode === 'register' && (
          <label className="field">
            <span className="field-label">ยืนยันรหัสผ่าน</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
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
