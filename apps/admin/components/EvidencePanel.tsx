'use client';

import { useCallback, useEffect, useState } from 'react';
import Modal from '@longrak/shared/components/Modal';
import type { AdminEvidence, AdminEvidenceDetail } from '@longrak/shared/api-types';
import { EVIDENCE_DAYS } from '@longrak/shared/legal-docs';
import ChatLog from './ChatLog';
import { adminFetch, errorText, formatDate } from './api';

/** Chats frozen as evidence from Users > ดูแชท. Read-only; each copy deletes itself after EVIDENCE_DAYS. */
export default function EvidencePanel({ toast }: { toast: (text: string) => void }) {
  const [items, setItems] = useState<AdminEvidence[] | null>(null);
  const [open, setOpen] = useState<AdminEvidenceDetail | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    adminFetch<AdminEvidence[]>('/api/admin/evidence')
      .then(setItems)
      .catch((e) => toast(errorText(e)));
  }, [toast]);
  useEffect(load, [load]);

  const read = (id: number) =>
    adminFetch<AdminEvidenceDetail>(`/api/admin/evidence/${id}`)
      .then(setOpen)
      .catch((e) => toast(errorText(e)));

  const q = query.trim().toLowerCase();
  const shown = (items ?? []).filter((e) => !q || [e.username, e.chatName, e.note, e.savedBy].some((s) => s.toLowerCase().includes(q)));

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">หลักฐาน</h1>
          <p className="admin-summary">
            สำเนาแชทที่เก็บจากหน้าผู้ใช้ แก้ไขไม่ได้ และลบเองเมื่อครบ {EVIDENCE_DAYS} วัน แม้ผู้ใช้จะลบแชทหรือบัญชีไปแล้วก็ยังดูได้ ห้ามเปิดเผยเนื้อหา
          </p>
        </div>
        <div className="admin-head-tools">
          <input className="admin-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาผู้ใช้ ตัวละคร หรือเหตุผล" aria-label="ค้นหาหลักฐาน" />
        </div>
      </div>

      {items === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <p className="admin-loading">{q ? `ไม่พบหลักฐานที่ตรงกับ “${query.trim()}”` : 'ยังไม่มีหลักฐาน กด "ดูแชท" ที่หน้าผู้ใช้ แล้วกด "เก็บหลักฐาน"'}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>ผู้ใช้</th>
              <th>ตัวละคร</th>
              <th>เหตุผล</th>
              <th>เก็บโดย</th>
              <th>เก็บเมื่อ</th>
              <th>ลบอัตโนมัติ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <td data-label="ผู้ใช้" className="admin-name">
                  {e.username}
                  {e.userId === null && <span className="admin-char-meta"> (ลบบัญชีแล้ว)</span>}
                </td>
                <td data-label="ตัวละคร">
                  <button className="link" onClick={() => read(e.id)}>
                    {e.chatName || 'ไม่มีชื่อ'}
                  </button>
                  <span className="admin-char-meta"> {e.messages} ข้อความ</span>
                </td>
                <td data-label="เหตุผล">{e.note || '—'}</td>
                <td data-label="เก็บโดย">{e.savedBy}</td>
                <td data-label="เก็บเมื่อ">{formatDate(e.createdAt)}</td>
                <td data-label="ลบอัตโนมัติ">{formatDate(e.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <Modal
          wide
          title={`${open.chatName} กับ ${open.username}`}
          subtitle={`เก็บโดย ${open.savedBy} เมื่อ ${formatDate(open.createdAt)}${open.note ? ` เหตุผล: ${open.note}` : ''} ลบอัตโนมัติ ${formatDate(open.expiresAt)}`}
          onClose={() => setOpen(null)}
        >
          <ChatLog chat={open.chat} username={open.username} />
        </Modal>
      )}
    </section>
  );
}
