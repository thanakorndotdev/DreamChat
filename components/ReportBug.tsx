'use client';

import { useEffect, useState } from 'react';
import { ImageSquare, X } from '@phosphor-icons/react';
import Modal from './Modal';
import { fileToAvatar } from '@/lib/image';
import { BODY_MAX, KIND_LABEL, type Report, type ReportContext, type ReportKind, REPORT_STATUS_LABEL, TITLE_MAX } from '@/lib/reports';

type Props = {
  /** Where the person was when they opened this, e.g. "ห้องแชท: ไอริส". */
  where: string;
  onClose: () => void;
  onSent: () => void;
};

function deviceContext(where: string): ReportContext {
  return {
    page: `${where} (${location.pathname})`,
    userAgent: navigator.userAgent,
    screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    language: navigator.language,
    time: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
  };
}

const dateTh = (ts: number) => new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ReportBug({ where, onClose, onSent }: Props) {
  const [tab, setTab] = useState<'new' | 'mine'>('new');
  const [kind, setKind] = useState<ReportKind>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [withDevice, setWithDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Report[] | null>(null);

  const loadMine = () =>
    fetch('/api/reports')
      .then((r) => (r.ok ? (r.json() as Promise<Report[]>) : []))
      .then(setMine)
      .catch(() => setMine([]));

  useEffect(() => {
    loadMine();
  }, []);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, body, screenshot, context: withDevice ? deviceContext(where) : null }),
      });
      if (!res.ok) throw new Error(await res.text());
      setTitle('');
      setBody('');
      setScreenshot(null);
      onSent();
      await loadMine();
      setTab('mine');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const replied = (mine ?? []).filter((r) => r.adminReply).length;

  return (
    <Modal
      title="แจ้งปัญหาหรือเสนอแนะ"
      subtitle="แชทของคุณจะไม่ถูกแนบไปด้วย"
      onClose={onClose}
      wide
      footer={
        tab === 'new' ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>
              ยกเลิก
            </button>
            <button className="btn btn-primary" onClick={send} disabled={busy || title.trim().length < 3 || body.trim().length < 10}>
              {busy ? 'กำลังส่ง…' : 'ส่งรายงาน'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="tabs report-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'new'} onClick={() => setTab('new')}>
          แจ้งเรื่องใหม่
        </button>
        <button role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')}>
          ที่เคยแจ้ง{mine?.length ? ` (${mine.length})` : ''}
          {replied > 0 && <span className="tab-count">{replied}</span>}
        </button>
      </div>

      {tab === 'new' ? (
        <div className="form">
          <div className="tabs" role="radiogroup" aria-label="ประเภท">
            {(Object.keys(KIND_LABEL) as ReportKind[]).map((k) => (
              <button key={k} role="radio" aria-checked={kind === k} aria-selected={kind === k} onClick={() => setKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field-label">หัวข้อ</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} placeholder={kind === 'bug' ? 'เช่น กดส่งข้อความแล้วค้าง' : 'เช่น อยากให้เปลี่ยนธีมได้'} />
          </label>
          <label className="field">
            <span className="field-label">รายละเอียด</span>
            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={BODY_MAX}
              placeholder={kind === 'bug' ? 'ทำอะไรอยู่ เกิดอะไรขึ้น และคาดว่าควรเป็นแบบไหน' : 'เล่าให้ฟังได้เลย'}
            />
            <span className="help">
              {body.length}/{BODY_MAX}
            </span>
          </label>

          <div className="report-shot">
            {screenshot ? (
              <div className="report-shot-preview">
                <img src={screenshot} alt="รูปหน้าจอที่แนบ" />
                <button className="icon-btn" onClick={() => setScreenshot(null)} aria-label="เอารูปออก">
                  <X size={16} weight="bold" />
                </button>
              </div>
            ) : (
              <label className="btn btn-soft">
                <ImageSquare size={16} /> แนบรูปหน้าจอ (ไม่บังคับ)
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      setScreenshot(await fileToAvatar(file, 1600));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'แนบรูปไม่สำเร็จ');
                    }
                  }}
                />
              </label>
            )}
            <span className="help">ตรวจรูปก่อนแนบ อย่าให้มีข้อมูลส่วนตัวหรือแชทที่ไม่อยากให้ใครเห็น</span>
          </div>

          <label className="consent-row">
            <input type="checkbox" checked={withDevice} onChange={(e) => setWithDevice(e.target.checked)} />
            <span>
              แนบข้อมูลอุปกรณ์เพื่อช่วยหาสาเหตุ: หน้าที่เปิดอยู่ ({where}) เบราว์เซอร์ และขนาดหน้าจอ
            </span>
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : mine === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : mine.length === 0 ? (
        <p className="admin-loading">ยังไม่เคยแจ้งเรื่องไหน</p>
      ) : (
        <ul className="report-list">
          {mine.map((r) => (
            <li key={r.id}>
              <div className="report-head">
                <span className="report-title">{r.title}</span>
                <span className="report-status" data-status={r.status}>
                  {REPORT_STATUS_LABEL[r.status]}
                </span>
              </div>
              <p className="help">
                {KIND_LABEL[r.kind]}, แจ้งเมื่อ {dateTh(r.createdAt)}
              </p>
              {r.adminReply && (
                <p className="report-reply">
                  <strong>ทีมงานตอบ:</strong> {r.adminReply}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
