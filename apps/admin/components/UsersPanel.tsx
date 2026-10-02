'use client';

import { useCallback, useEffect, useState } from 'react';
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import Modal from '@longrak/shared/components/Modal';
import type { AdminUser } from '@longrak/shared/api-types';
import { adminFetch, errorText, formatDate } from './api';

import { FREE_PLAN_ID, type Plan } from '@longrak/shared/plans';

type Props = {
  toast: (text: string) => void;
};

export default function UsersPanel({ toast }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    adminFetch<Plan[]>('/api/admin/plans')
      .then((p) => setPlans(p.filter((x) => x.id !== FREE_PLAN_ID)))
      .catch(() => {});
  }, []);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(() => {
    adminFetch<AdminUser[]>('/api/admin/users')
      .then(setUsers)
      .catch((e) => toast(errorText(e)));
  }, [toast]);

  useEffect(load, [load]);

  const remove = async (u: AdminUser) => {
    try {
      await adminFetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      toast(`ลบบัญชี ${u.username} แล้ว`);
      setConfirmId(null);
      load();
    } catch (e) {
      toast(errorText(e));
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (users ?? []).filter((u) => !q || [u.username, u.email, u.phone].some((s) => s?.toLowerCase().includes(q)));
  const members = (users ?? []).filter((u) => u.plan).length;

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">ผู้ใช้</h1>
          {users && (
            <p className="admin-summary">
              {users.length} บัญชี, สมาชิกแบบมีแพ็กเกจ {members} คน แชทของผู้ใช้เป็นความลับ หน้านี้ไม่แสดงเนื้อหาแชท
            </p>
          )}
        </div>
        <div className="admin-head-tools">
          <input className="admin-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ อีเมล หรือเบอร์" aria-label="ค้นหาผู้ใช้" />
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} weight="bold" />
            <span>เพิ่มผู้ใช้</span>
          </button>
        </div>
      </div>

      {users === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <p className="admin-loading">ไม่พบบัญชีที่ตรงกับ “{query.trim()}”</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>ชื่อผู้ใช้</th>
              <th>ติดต่อ</th>
              <th>แพ็กเกจ</th>
              <th>อายุ</th>
              <th>สิทธิ์</th>
              <th>เรื่อง</th>
              <th>PDPA</th>
              <th>สมัครเมื่อ</th>
              <th aria-label="จัดการ" />
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <td data-label="ชื่อผู้ใช้" className="admin-name">
                  {u.username}
                </td>
                <td data-label="ติดต่อ" className="admin-contact">
                  <span>{u.email ?? '—'}</span>
                  <span>{u.phone ?? ''}</span>
                </td>
                <td data-label="แพ็กเกจ">
                  {u.plan ? (
                    <span title={u.plan.source === 'stripe' ? 'ชำระผ่าน Stripe' : u.plan.source === 'code' ? 'ใช้โค้ด' : 'แอดมินให้'}>
                      {u.plan.name} ถึง {formatDate(u.plan.until)}
                    </span>
                  ) : (
                    'Free'
                  )}
                </td>
                <td data-label="อายุ">
                  {u.age === null ? 'ยังไม่ระบุ' : `${u.age} ปี`}
                  {u.age !== null && u.age < 18 && <span className="admin-char-meta"> ห้าม 18+</span>}
                </td>
                <td data-label="สิทธิ์">{u.isAdmin ? <span className="admin-badge">แอดมิน</span> : 'ผู้ใช้'}</td>
                <td data-label="เรื่อง">{u.characters}</td>
                <td data-label="PDPA">{u.consented ? (u.marketing ? 'ยอมรับ + รับข่าวสาร' : 'ยอมรับ') : 'ยังไม่ยอมรับ'}</td>
                <td data-label="สมัครเมื่อ">{formatDate(u.createdAt)}</td>
                <td className="admin-actions">
                  {confirmId === u.id ? (
                    <span className="confirm">
                      <span className="confirm-q">ลบบัญชีและตัวละครทั้งหมด?</span>
                      <button className="link danger" onClick={() => remove(u)}>
                        ลบเลย
                      </button>
                      <button className="link" onClick={() => setConfirmId(null)}>
                        ไม่ลบ
                      </button>
                    </span>
                  ) : (
                    <>
                      <button className="icon-btn" onClick={() => setEditing(u)} aria-label={`แก้ไข ${u.username}`} title="แก้ไข">
                        <PencilSimple size={18} />
                      </button>
                      <button className="icon-btn" onClick={() => setConfirmId(u.id)} aria-label={`ลบ ${u.username}`} title="ลบ">
                        <Trash size={18} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <UserModal
          user={editing === 'new' ? null : editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            toast(text);
            setEditing(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function UserModal({ user, plans, onClose, onSaved }: { user: AdminUser | null; plans: Plan[]; onClose: () => void; onSaved: (text: string) => void }) {
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(user?.isAdmin ?? false);
  const [signOut, setSignOut] = useState(false);
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [grantPlan, setGrantPlan] = useState('');
  const [grantDays, setGrantDays] = useState('30');
  const [revoke, setRevoke] = useState(false);
  const [birthdate, setBirthdate] = useState(user?.birthdate ?? '');
  const [guardian, setGuardian] = useState(user?.guardianConsent ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!user) {
        await adminFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password, isAdmin, email, phone }) });
        onSaved(`เพิ่มบัญชี ${username.trim()} แล้ว`);
        return;
      }
      const changes: Record<string, unknown> = {};
      if (username.trim() !== user.username) changes.username = username;
      if (password) changes.password = password;
      if (email.trim() !== (user.email ?? '')) changes.email = email;
      if (phone.trim() !== (user.phone ?? '')) changes.phone = phone;
      if (birthdate !== (user.birthdate ?? '')) changes.birthdate = birthdate;
      if (guardian !== user.guardianConsent) changes.guardianConsent = guardian;
      if (revoke) changes.revoke = true;
      else if (grantPlan) changes.grant = { planId: grantPlan, days: Number(grantDays) };
      if (isAdmin !== user.isAdmin) changes.isAdmin = isAdmin;
      // A new password should lock out whoever is signed in with the old one.
      if (signOut || password) changes.signOut = true;
      if (Object.keys(changes).length) await adminFetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      onSaved(`บันทึกบัญชี ${username.trim()} แล้ว`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? `แก้ไขบัญชี ${user.username}` : 'เพิ่มผู้ใช้'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !username.trim() || (!user && !password)}>
            {busy ? 'กำลังบันทึก…' : user ? 'บันทึก' : 'เพิ่มผู้ใช้'}
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="field-label">ชื่อผู้ใช้</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32} autoComplete="off" />
          <span className="help">3–32 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้</span>
        </label>
        <label className="field">
          <span className="field-label">{user ? 'รหัสผ่านใหม่' : 'รหัสผ่าน'}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <span className="help">{user ? 'เว้นว่างไว้ถ้าไม่เปลี่ยน ตั้งใหม่แล้วทุกเครื่องที่ล็อกอินอยู่จะถูกออกจากระบบ' : 'อย่างน้อย 8 ตัว'}</span>
        </label>
        <div className="grid-2">
          <label className="field">
            <span className="field-label">อีเมล</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span className="field-label">เบอร์โทร</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
          </label>
        </div>
        {user && (
          <div className="grid-2">
            <label className="field">
              <span className="field-label">วันเกิด</span>
              <input type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
              <span className="help">
                {user.age === null ? 'ยังไม่ระบุ ผู้ใช้จะถูกขอให้กรอกตอนเข้าใช้' : `อายุ ${user.age} ปี${user.age < 18 ? ' ใช้โหมด 18+ ไม่ได้' : ''}`}. แก้เมื่อผู้ใช้แจ้งว่ากรอกผิดเท่านั้น
              </span>
            </label>
            <label className="editor-check guardian-check">
              <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} />
              ผู้ปกครองยินยอมแล้ว (จำเป็นถ้าอายุต่ำกว่า 20 ปี)
            </label>
          </div>
        )}
        {user && (
          <fieldset className="field grant">
            <legend className="field-label">แพ็กเกจ</legend>
            <p className="help">
              {user.plan
                ? `ตอนนี้ ${user.plan.name} ถึง ${formatDate(user.plan.until)} (${user.plan.source === 'stripe' ? 'ชำระผ่าน Stripe' : user.plan.source === 'code' ? 'ใช้โค้ด' : 'แอดมินให้'})`
                : 'ตอนนี้ใช้ Free'}
            </p>
            <div className="grid-2">
              <label className="field">
                <span className="field-label">ให้ใช้ฟรี</span>
                <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} disabled={revoke}>
                  <option value="">ไม่เปลี่ยน</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">จำนวนวัน</span>
                <input type="number" min={1} value={grantDays} onChange={(e) => setGrantDays(e.target.value)} disabled={!grantPlan || revoke} />
                <span className="help">ถ้าแพ็กเกจเดิม จะต่อจากวันที่เหลือ</span>
              </label>
            </div>
            {user.plan && user.plan.source !== 'stripe' && (
              <label className="editor-check">
                <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />
                ยกเลิกแพ็กเกจ กลับเป็น Free ทันที
              </label>
            )}
          </fieldset>
        )}
        <label className="toggle admin-toggle">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          <span>
            <span className="toggle-title">สิทธิ์แอดมิน</span>
            <span className="help">เข้าหน้านี้และแก้ไขข้อมูลของทุกคนได้</span>
          </span>
        </label>
        {user && user.sessions > 0 && (
          <label className="toggle admin-toggle">
            <input type="checkbox" checked={signOut || !!password} disabled={!!password} onChange={(e) => setSignOut(e.target.checked)} />
            <span>
              <span className="toggle-title">ออกจากระบบทุกเครื่อง</span>
              <span className="help">ตอนนี้ล็อกอินอยู่ {user.sessions} เครื่อง</span>
            </span>
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
