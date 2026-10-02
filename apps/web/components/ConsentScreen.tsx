'use client';

import { useState } from 'react';
import { BirthdateField, ConsentChecks } from './AuthScreen';
import { GUARDIAN_UNDER, ageFromBirthdate } from '@longrak/shared/age';
import type { ConsentForm } from '@/lib/store';

type Props = {
  username: string;
  email: string | null;
  phone: string | null;
  birthdate: string | null;
  guardianConsent: boolean;
  onSubmit: (form: ConsentForm) => Promise<void>;
  onLogout: () => void;
};

/** Shown once to accounts that haven't accepted the current PDPA terms or are missing email/phone. */
export default function ConsentScreen({ username, email, phone, birthdate, guardianConsent, onSubmit, onLogout }: Props) {
  const [mail, setMail] = useState('');
  const [tel, setTel] = useState('');
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [birth, setBirth] = useState('');
  const [guardian, setGuardian] = useState(false);
  const age = ageFromBirthdate(birthdate ?? birth);
  const needGuardian = age !== null && age < GUARDIAN_UNDER && !guardianConsent;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email && !mail.trim()) return setError('กรอกอีเมล');
    if (!phone && !tel.trim()) return setError('กรอกเบอร์โทร');
    if (age === null) return setError('กรอกวันเกิด');
    if (needGuardian && !guardian) return setError('อายุต่ำกว่า 20 ปี ต้องให้ผู้ปกครองรับทราบและยินยอมก่อน');
    if (!consent) return setError('ติ๊กยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้งานเพื่อใช้งานต่อ');
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        consent,
        marketing,
        email: email ? undefined : mail.trim(),
        phone: phone ? undefined : tel.trim(),
        birthdate: birthdate ? undefined : birth,
        guardian: needGuardian ? guardian : undefined,
      });
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
          เราปรับนโยบายความเป็นส่วนตัวตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA){!email || !phone || !birthdate ? ' และต้องการข้อมูลเพิ่ม' : ''} ยืนยันด้านล่างเพื่อใช้งานต่อ
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

        {!birthdate ? (
          <BirthdateField value={birth} guardian={guardian} onChange={setBirth} onGuardian={setGuardian} />
        ) : (
          needGuardian && (
            <label className="consent-row consent-guardian">
              <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
              <span>ผู้ปกครองของฉันรับทราบและยินยอมให้ใช้บริการนี้ (จำเป็นสำหรับผู้ที่อายุต่ำกว่า 20 ปี)</span>
            </label>
          )
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
