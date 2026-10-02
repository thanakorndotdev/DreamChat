'use client';

import { useState } from 'react';
import { ConsentChecks } from './AuthScreen';

type Props = {
  username: string;
  email: string | null;
  phone: string | null;
  onSubmit: (form: { consent: boolean; marketing: boolean; email?: string; phone?: string }) => Promise<void>;
  onLogout: () => void;
};

/** Shown once to accounts that haven't accepted the current PDPA terms or are missing email/phone. */
export default function ConsentScreen({ username, email, phone, onSubmit, onLogout }: Props) {
  const [mail, setMail] = useState('');
  const [tel, setTel] = useState('');
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email && !mail.trim()) return setError('กรอกอีเมล');
    if (!phone && !tel.trim()) return setError('กรอกเบอร์โทร');
    if (!consent) return setError('ติ๊กยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานเพื่อใช้งานต่อ');
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ consent, marketing, email: email ? undefined : mail.trim(), phone: phone ? undefined : tel.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <p className="brand-mark">หลงรักแชท</p>
        <h1 className="consent-title">สวัสดี {username}</h1>
        <p className="auth-lead">
          เราปรับนโยบายความเป็นส่วนตัวตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA){!email || !phone ? ' และต้องการข้อมูลติดต่อเพิ่ม' : ''} ยืนยันด้านล่างเพื่อใช้งานต่อ
          แชทเดิมของคุณยังอยู่ครบ
        </p>

        {!email && (
          <label className="field">
            <span className="field-label">อีเมล</span>
            <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} autoComplete="email" inputMode="email" autoFocus />
          </label>
        )}
        {!phone && (
          <label className="field">
            <span className="field-label">เบอร์โทร</span>
            <input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="0812345678" />
          </label>
        )}

        <ConsentChecks consent={consent} marketing={marketing} onChange={(k, v) => (k === 'consent' ? setConsent(v) : setMarketing(v))} />

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : 'ยืนยันและใช้งานต่อ'}
        </button>
        <button type="button" className="link consent-logout" onClick={onLogout}>
          ไม่ยอมรับ ออกจากระบบ
        </button>
      </form>
    </main>
  );
}
