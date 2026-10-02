'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Throttle } from '@/app/api/admin/security/route';
import { adminFetch, errorText, formatDate } from './api';

/** What each throttle key prefix counts, in words. */
function describe(key: string) {
  const [kind, ...rest] = key.split(':');
  const target = rest.join(':');
  switch (kind) {
    case 'login':
      return `รหัสผิด: ${target.replace(/:([^:]*)$/, ' → บัญชี $1')}`;
    case 'login-ip':
      return `รหัสผิดจาก IP ${target}`;
    case 'login-any':
      return `รหัสผิดของบัญชี ${target} (ทุก IP)`;
    case 'register':
      return `สมัครจาก IP ${target}`;
    case 'report':
      return `ส่งรายงาน (ผู้ใช้ #${target})`;
    case 'password':
      return `เปลี่ยนรหัสผ่าน (ผู้ใช้ #${target})`;
    case 'delete':
      return `ลบบัญชี (ผู้ใช้ #${target})`;
    default:
      return key;
  }
}

export default function SecurityPanel({ toast }: { toast: (text: string) => void }) {
  const [rows, setRows] = useState<Throttle[] | null>(null);
  const [onlyBlocked, setOnlyBlocked] = useState(true);

  const load = useCallback(() => {
    adminFetch<Throttle[]>('/api/admin/security')
      .then(setRows)
      .catch((e) => toast(errorText(e)));
  }, [toast]);
  useEffect(load, [load]);

  const lift = async (key: string) => {
    try {
      await adminFetch(`/api/admin/security?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      toast('ปลดล็อกแล้ว');
      load();
    } catch (e) {
      toast(errorText(e));
    }
  };

  const shown = (rows ?? []).filter((r) => !onlyBlocked || r.blocked);

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">ความปลอดภัย</h1>
          <p className="admin-summary">
            ตัวจำกัดการลองรหัส การสมัคร และการส่งรายงาน ที่ยังนับอยู่ ปลดล็อกให้คนที่พิมพ์รหัสผิดจนโดนล็อกได้ที่นี่ ถ้า IP เดียวสมัครหรือเดารหัสถี่ผิดปกติ อาจเป็นบอท
          </p>
        </div>
        <div className="admin-head-tools">
          <label className="editor-check">
            <input type="checkbox" checked={onlyBlocked} onChange={(e) => setOnlyBlocked(e.target.checked)} />
            เฉพาะที่โดนล็อกอยู่
          </label>
          <button className="btn btn-ghost" onClick={load}>
            รีเฟรช
          </button>
        </div>
      </div>

      {rows === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <p className="admin-loading">{onlyBlocked ? 'ไม่มีใครโดนล็อกอยู่ตอนนี้' : 'ไม่มีตัวจำกัดที่กำลังนับ'}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>รายการ</th>
              <th>จำนวน</th>
              <th>หมดเวลา</th>
              <th aria-label="จัดการ" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key}>
                <td data-label="รายการ" className="admin-name">
                  {describe(r.key)}
                </td>
                <td data-label="จำนวน">
                  {r.count} / {r.limit} {r.blocked && <span className="report-status" data-status="open">ล็อกอยู่</span>}
                </td>
                <td data-label="หมดเวลา">{formatDate(r.until)}</td>
                <td className="admin-actions">
                  <button className="btn btn-soft" onClick={() => lift(r.key)}>
                    ปลดล็อก
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
