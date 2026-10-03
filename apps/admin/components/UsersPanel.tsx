'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChatsCircle, PencilSimple, Plus, Seal, Trash } from '@phosphor-icons/react';
import Modal from '@longrak/shared/components/Modal';
import type { AdminChat, AdminChatSummary, AdminUser } from '@longrak/shared/api-types';
import ChatLog from './ChatLog';
import { adminFetch, errorText, formatDate } from './api';

import { FREE_PLAN_ID, type Plan } from '@longrak/shared/plans';
import { EVIDENCE_DAYS } from '@longrak/shared/legal-docs';

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
  const [news, setNews] = useState<'all' | 'yes' | 'no'>('all');
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [reading, setReading] = useState<AdminUser | null>(null);
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
  const shown = (users ?? []).filter(
    (u) => (!q || [u.username, u.email, u.phone].some((s) => s?.toLowerCase().includes(q))) && (news === 'all' || u.marketing === (news === 'yes')),
  );
  const members = (users ?? []).filter((u) => u.plan).length;
  const subscribers = (users ?? []).filter((u) => u.marketing).length;

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">ผู้ใช้</h1>
          {users && (
            <p className="admin-summary">
              {users.length} บัญชี, สมาชิกแบบมีแพ็กเกจ {members} คน, รับข่าวสาร {subscribers} คน เปิดอ่านแชทเฉพาะเมื่อจำเป็น เช่น ตรวจสอบเรื่องที่ถูกแจ้ง และห้ามเปิดเผย
            </p>
          )}
        </div>
        <div className="admin-head-tools">
          <input className="admin-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ อีเมล หรือเบอร์" aria-label="ค้นหาผู้ใช้" />
          <select className="admin-select" value={news} onChange={(e) => setNews(e.target.value as typeof news)} aria-label="กรองตามการรับข่าวสาร">
            <option value="all">ทุกคน</option>
            <option value="yes">รับข่าวสาร</option>
            <option value="no">ไม่รับข่าวสาร</option>
          </select>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} weight="bold" />
            <span>เพิ่มผู้ใช้</span>
          </button>
        </div>
      </div>

      {users === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <p className="admin-loading">{q ? `ไม่พบบัญชีที่ตรงกับ “${query.trim()}”` : 'ไม่มีบัญชีในกลุ่มนี้'}</p>
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
              <th>โทเคน</th>
              <th>PDPA</th>
              <th>ข่าวสาร</th>
              <th>สมัครเมื่อ</th>
              <th>เข้าสู่ระบบล่าสุด</th>
              <th>ใช้งานล่าสุด</th>
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
                    <span title={u.plan.source === 'stripe' ? 'ชำระผ่าน Stripe' : u.plan.source === 'promptpay' ? 'จ่าย PromptPay' : u.plan.source === 'code' ? 'ใช้โค้ด' : 'แอดมินให้'}>
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
                <td data-label="โทเคน">{u.tokens.toLocaleString('th-TH')}</td>
                <td data-label="PDPA">{u.consented ? 'ยอมรับ' : 'ยังไม่ยอมรับ'}</td>
                <td data-label="ข่าวสาร">{u.marketing ? <span className="admin-badge">รับข่าวสาร</span> : 'ไม่รับ'}</td>
                <td data-label="สมัครเมื่อ">{formatDate(u.createdAt)}</td>
                <td data-label="เข้าสู่ระบบล่าสุด">{u.lastLoginAt ? formatDate(u.lastLoginAt) : '—'}</td>
                <td data-label="ใช้งานล่าสุด">{u.lastSeenAt ? formatDate(u.lastSeenAt) : '—'}</td>
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
                      <button className="icon-btn" onClick={() => setReading(u)} aria-label={`ดูแชทของ ${u.username}`} title="ดูแชท">
                        <ChatsCircle size={18} />
                      </button>
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

      {reading && <ChatsModal user={reading} onClose={() => setReading(null)} toast={toast} />}

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
  const [tokenDelta, setTokenDelta] = useState('');
  const [tokenNote, setTokenNote] = useState('');
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
      if (Math.trunc(Number(tokenDelta))) changes.tokens = { delta: Math.trunc(Number(tokenDelta)), note: tokenNote };
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
                ? `ตอนนี้ ${user.plan.name} ถึง ${formatDate(user.plan.until)} (${user.plan.source === 'stripe' ? 'ชำระผ่าน Stripe' : user.plan.source === 'promptpay' ? 'จ่าย PromptPay' : user.plan.source === 'code' ? 'ใช้โค้ด' : 'แอดมินให้'})`
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
        {user && (
          <fieldset className="field grant">
            <legend className="field-label">โทเคน</legend>
            <p className="help">ตอนนี้มี {user.tokens.toLocaleString('th-TH')} โทเคน</p>
            <div className="grid-2">
              <label className="field">
                <span className="field-label">เพิ่มหรือหัก</span>
                <input type="number" step={1} value={tokenDelta} onChange={(e) => setTokenDelta(e.target.value)} placeholder="เช่น 500 หรือ -100" />
              </label>
              <label className="field">
                <span className="field-label">เหตุผล</span>
                <input value={tokenNote} onChange={(e) => setTokenNote(e.target.value)} maxLength={200} placeholder="เช่น ชดเชยระบบล่ม" />
              </label>
            </div>
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

/** An account's chats, then one chat's messages. Read-only: the admin can't change a chat. */
function ChatsModal({ user, onClose, toast }: { user: AdminUser; onClose: () => void; toast: (text: string) => void }) {
  const [chats, setChats] = useState<AdminChatSummary[] | null>(null);
  const [open, setOpen] = useState<AdminChat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Freezes the open chat as it is now; the copy stays for EVIDENCE_DAYS even if the chat or account goes.
  const keep = async () => {
    if (!open) return;
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/api/admin/evidence', { method: 'POST', body: JSON.stringify({ userId: user.id, chatId: open.id, note }) });
      toast(`เก็บแชท ${open.name} เป็นหลักฐานแล้ว ดูได้ที่แท็บหลักฐาน`);
      setNote('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    adminFetch<AdminChatSummary[]>(`/api/admin/users/${user.id}/chats`)
      .then(setChats)
      .catch((e) => setError(errorText(e)));
  }, [user.id]);

  const read = (id: string) => {
    setError(null);
    adminFetch<AdminChat>(`/api/admin/users/${user.id}/chats/${encodeURIComponent(id)}`)
      .then(setOpen)
      .catch((e) => setError(errorText(e)));
  };

  return (
    <Modal
      wide
      title={open ? `${open.name} กับ ${user.username}` : `แชทของ ${user.username}`}
      subtitle={open ? `${open.messages.length} ข้อความ อัปเดต ${formatDate(open.updatedAt)} อ่านอย่างเดียว` : 'เปิดอ่านเฉพาะเมื่อจำเป็น และห้ามเปิดเผยเนื้อหาแชท'}
      onClose={onClose}
      footer={
        open ? (
          <>
            <button className="btn btn-ghost" onClick={() => setOpen(null)}>
              <ArrowLeft size={18} />
              <span>กลับไปรายการแชท</span>
            </button>
            <input className="admin-evidence-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="เหตุผล เช่น เลขเรื่องที่ถูกแจ้ง" aria-label="เหตุผลที่เก็บหลักฐาน" />
            <button className="btn btn-primary" onClick={keep} disabled={saving} title={`เก็บสำเนาแชทนี้ไว้ ${EVIDENCE_DAYS} วัน แก้ไขไม่ได้`}>
              <Seal size={18} />
              <span>{saving ? 'กำลังเก็บ…' : 'เก็บหลักฐาน'}</span>
            </button>
          </>
        ) : undefined
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {open ? (
        <ChatLog chat={open} username={user.username} />
      ) : chats === null ? (
        !error && <p className="admin-loading">กำลังโหลด…</p>
      ) : chats.length === 0 ? (
        <p className="admin-loading">บัญชีนี้ยังไม่มีแชท</p>
      ) : (
        <ul className="admin-chat-list">
          {chats.map((c) => (
            <li key={c.id}>
              <button onClick={() => read(c.id)}>
                <span className="admin-char-name">{c.name || 'ไม่มีชื่อ'}</span>
                <span className="admin-char-meta">
                  {c.messages} ข้อความ · คุยล่าสุด {formatDate(c.updatedAt)}
                  {c.sourceId ? ' · จากคลังตัวละคร' : ' · ตัวละครที่สร้างเอง'}
                </span>
                {c.lastText && <span className="admin-chat-last">{c.lastText}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
