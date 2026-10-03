'use client';

import { useEffect, useState } from 'react';
import LegalBody from '@longrak/shared/components/LegalBody';
import { LEGAL_DOCS, LEGAL_TITLES, type LegalDoc, type LegalDocId, formatLegalDate } from '@longrak/shared/legal-docs';
import { adminFetch, errorText } from './api';

type Saved = LegalDoc & { edited: boolean };

/** Edits the public /privacy and /terms pages. Saving stamps today's date as "ปรับปรุงล่าสุด". */
export default function LegalPanel({ toast }: { toast: (text: string) => void }) {
  const [doc, setDoc] = useState<LegalDocId>('privacy');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setSaved(null);
    setConfirmReset(false);
    adminFetch<Saved>(`/api/admin/legal/${doc}`)
      .then((d) => {
        setSaved(d);
        setBody(d.body);
      })
      .catch((e) => toast(errorText(e)));
  }, [doc, toast]);

  const put = async (payload: { body: string } | { reset: true }, done: string) => {
    setBusy(true);
    try {
      const d = await adminFetch<Saved>(`/api/admin/legal/${doc}`, { method: 'PUT', body: JSON.stringify(payload) });
      setSaved(d);
      setBody(d.body);
      setConfirmReset(false);
      toast(done);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const dirty = !!saved && body !== saved.body;

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">นโยบายและข้อกำหนด</h1>
          <p className="admin-summary">
            {saved
              ? `${LEGAL_TITLES[doc]} ปรับปรุงล่าสุด ${formatLegalDate(saved.updatedAt)}${saved.edited ? ' (แก้จากหน้านี้)' : ' (ข้อความตั้งต้น)'}`
              : 'กำลังโหลด…'}
          </p>
        </div>
        <div className="tabs" role="tablist" aria-label="เอกสาร">
          {LEGAL_DOCS.map((d) => (
            <button key={d} role="tab" aria-selected={doc === d} onClick={() => setDoc(d)} disabled={busy}>
              {LEGAL_TITLES[d]}
            </button>
          ))}
        </div>
      </div>

      {saved && (
        <div className="admin-legal">
          <label className="field">
            <span className="field-label">เนื้อหา</span>
            <textarea rows={28} value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
            <span className="help">
              ขึ้นบรรทัดด้วย <code>## </code> = หัวข้อ, <code>- </code> = รายการ, เว้นบรรทัดว่าง = ย่อหน้าใหม่. <code>{'{operator}'}</code> และ{' '}
              <code>{'{contact}'}</code> จะแทนด้วยชื่อผู้ให้บริการและอีเมลติดต่อจากการตั้งค่าเซิร์ฟเวอร์. ถ้าเปลี่ยนสาระสำคัญของนโยบาย ควรแจ้งผู้ใช้ให้ยอมรับใหม่
            </span>
          </label>
          <div className="field">
            <span className="field-label">ตัวอย่าง</span>
            <div className="legal-main admin-legal-preview">
              <LegalBody body={body} operator="[ชื่อผู้ให้บริการ]" contact="[อีเมลติดต่อ]" />
            </div>
          </div>
        </div>
      )}

      {saved && (
        <div className="settings-actions">
          <button className="btn btn-primary" onClick={() => put({ body }, `บันทึก${LEGAL_TITLES[doc]}แล้ว`)} disabled={busy || !dirty || !body.trim()}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <button className="btn btn-ghost" onClick={() => setBody(saved.body)} disabled={busy || !dirty}>
            ยกเลิกที่แก้
          </button>
          {saved.edited &&
            (confirmReset ? (
              <span className="confirm">
                <span className="confirm-q">กลับไปใช้ข้อความตั้งต้น?</span>
                <button className="link danger" onClick={() => put({ reset: true }, `กลับไปใช้${LEGAL_TITLES[doc]}ตั้งต้นแล้ว`)}>
                  ใช่
                </button>
                <button className="link" onClick={() => setConfirmReset(false)}>
                  ไม่
                </button>
              </span>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirmReset(true)} disabled={busy}>
                กลับไปใช้ข้อความตั้งต้น
              </button>
            ))}
        </div>
      )}
    </section>
  );
}
