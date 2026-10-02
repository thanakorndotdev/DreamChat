'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { KIND_LABEL, type Report, type ReportStatus, REPORT_STATUS_LABEL } from '@/lib/reports';
import { adminFetch, errorText, formatDate } from './api';

type AdminReport = Report & { hasScreenshot: boolean };
type Filter = 'active' | ReportStatus | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'active', label: 'ยังไม่เสร็จ' },
  { id: 'open', label: 'รอดู' },
  { id: 'in_progress', label: 'กำลังแก้' },
  { id: 'resolved', label: 'แก้แล้ว' },
  { id: 'closed', label: 'ปิดแล้ว' },
  { id: 'all', label: 'ทั้งหมด' },
];

const matches = (r: AdminReport, f: Filter) => (f === 'all' ? true : f === 'active' ? r.status === 'open' || r.status === 'in_progress' : r.status === f);

export default function ReportsPanel({ toast }: { toast: (text: string) => void }) {
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [filter, setFilter] = useState<Filter>('active');
  const [open, setOpen] = useState<AdminReport | null>(null);

  const load = useCallback(() => {
    adminFetch<AdminReport[]>('/api/admin/reports')
      .then(setReports)
      .catch((e) => toast(errorText(e)));
  }, [toast]);
  useEffect(load, [load]);

  const shown = (reports ?? []).filter((r) => matches(r, filter));

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">แจ้งปัญหา</h1>
          <p className="admin-summary">บั๊กและข้อเสนอแนะจากผู้ใช้ คำตอบของแอดมินจะแสดงให้ผู้แจ้งเห็น</p>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="สถานะ">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} ({(reports ?? []).filter((r) => matches(r, f.id)).length})
          </button>
        ))}
      </div>

      {reports === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <p className="admin-loading">ไม่มีรายงานในหมวดนี้</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>หัวข้อ</th>
              <th>ประเภท</th>
              <th>ผู้แจ้ง</th>
              <th>สถานะ</th>
              <th>แจ้งเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="report-row" onClick={() => setOpen(r)}>
                <td data-label="หัวข้อ" className="admin-name">
                  <button className="link" onClick={() => setOpen(r)}>
                    {r.title}
                  </button>
                  {r.hasScreenshot && <span className="admin-char-meta"> มีรูป</span>}
                </td>
                <td data-label="ประเภท">{KIND_LABEL[r.kind]}</td>
                <td data-label="ผู้แจ้ง">{r.author?.username ?? 'บัญชีที่ถูกลบ'}</td>
                <td data-label="สถานะ">
                  <span className="report-status" data-status={r.status}>
                    {REPORT_STATUS_LABEL[r.status]}
                  </span>
                </td>
                <td data-label="แจ้งเมื่อ">{formatDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <ReportModal
          report={open}
          onClose={() => setOpen(null)}
          onSaved={(text) => {
            toast(text);
            setOpen(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function ReportModal({ report, onClose, onSaved }: { report: AdminReport; onClose: () => void; onSaved: (t: string) => void }) {
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [reply, setReply] = useState(report.adminReply);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!report.hasScreenshot) return;
    adminFetch<{ screenshot: string | null }>(`/api/admin/reports/${report.id}`)
      .then((r) => setShot(r.screenshot))
      .catch(() => {});
  }, [report]);

  const save = async () => {
    setBusy(true);
    try {
      await adminFetch(`/api/admin/reports/${report.id}`, { method: 'PATCH', body: JSON.stringify({ status, reply }) });
      onSaved('บันทึกแล้ว');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await adminFetch(`/api/admin/reports/${report.id}`, { method: 'DELETE' });
      onSaved('ลบรายงานแล้ว');
    } catch (e) {
      setError(errorText(e));
    }
  };

  const c = report.context;

  return (
    <Modal
      title={report.title}
      subtitle={`${KIND_LABEL[report.kind]} จาก ${report.author ? `${report.author.username}${report.author.email ? ` (${report.author.email})` : ''}` : 'บัญชีที่ถูกลบ'}, ${formatDate(report.createdAt)}`}
      onClose={onClose}
      wide
      footer={
        <>
          {confirmDelete ? (
            <span className="confirm push">
              <span className="confirm-q">ลบรายงานนี้?</span>
              <button className="link danger" onClick={remove}>
                ลบเลย
              </button>
              <button className="link" onClick={() => setConfirmDelete(false)}>
                ไม่ลบ
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost danger-btn push" onClick={() => setConfirmDelete(true)}>
              ลบ
            </button>
          )}
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <div className="form">
        <p className="report-body">{report.body}</p>
        {report.hasScreenshot && (shot ? <img className="report-shot-full" src={shot} alt="รูปหน้าจอที่ผู้ใช้แนบ" /> : <p className="help">กำลังโหลดรูป…</p>)}
        {c ? (
          <dl className="report-context">
            {c.page && (
              <>
                <dt>หน้า</dt>
                <dd>{c.page}</dd>
              </>
            )}
            {c.userAgent && (
              <>
                <dt>เบราว์เซอร์</dt>
                <dd>{c.userAgent}</dd>
              </>
            )}
            {c.screen && (
              <>
                <dt>หน้าจอ</dt>
                <dd>{c.screen}</dd>
              </>
            )}
            {c.language && (
              <>
                <dt>ภาษา</dt>
                <dd>{c.language}</dd>
              </>
            )}
            {c.time && (
              <>
                <dt>เวลาที่เครื่อง</dt>
                <dd>{c.time}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="help">ผู้แจ้งไม่ได้แนบข้อมูลอุปกรณ์</p>
        )}
        <div className="grid-2">
          <label className="field">
            <span className="field-label">สถานะ</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as ReportStatus)}>
              {(Object.keys(REPORT_STATUS_LABEL) as ReportStatus[]).map((s) => (
                <option key={s} value={s}>
                  {REPORT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span className="field-label">ตอบผู้แจ้ง</span>
          <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="เช่น แก้แล้วในเวอร์ชันล่าสุด ลองรีเฟรชหน้าอีกครั้ง" />
          <span className="help">ผู้แจ้งเห็นข้อความนี้ในแท็บ “ที่เคยแจ้ง”</span>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
