'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SignOut } from '@phosphor-icons/react';
import Modal from './Modal';
import type { Me } from '@/lib/store';

type Props = {
  me: Me;
  planName: string;
  onClose: () => void;
  onLogout: () => void;
  onDeleted: () => void;
  toast: (text: string) => void;
};

const dateTh = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

async function call(url: string, method: string, body: object) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
}

/** The signed-in person's own account: details, password, sign out, and deleting the account. */
export default function AccountModal({ me, planName, onClose, onLogout, onDeleted, toast }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirmNext) return setPwError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    setPwBusy(true);
    setPwError(null);
    try {
      await call('/api/account/password', 'POST', { current, next });
      setCurrent('');
      setNext('');
      setConfirmNext('');
      toast('เปลี่ยนรหัสผ่านแล้ว เครื่องอื่นที่ล็อกอินอยู่ถูกออกจากระบบ');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setPwBusy(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await call('/api/account', 'DELETE', { password: deletePw });
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'ลบบัญชีไม่สำเร็จ');
      setDeleteBusy(false);
    }
  };

  return (
    <Modal
      title="บัญชีของฉัน"
      onClose={onClose}
      footer={
        <button className="btn btn-ghost" onClick={onLogout}>
          <SignOut size={18} /> ออกจากระบบ
        </button>
      }
    >
      <div className="form">
        <dl className="account-facts">
          <dt>ชื่อผู้ใช้</dt>
          <dd>{me.username}</dd>
          <dt>อีเมล</dt>
          <dd>{me.email ?? '—'}</dd>
          <dt>เบอร์โทร</dt>
          <dd>{me.phone ?? '—'}</dd>
          <dt>วันเกิด</dt>
          <dd>
            {me.birthdate ? `${dateTh(me.birthdate)} (อายุ ${me.age} ปี)` : '—'}
            <span className="help">{me.adult ? 'ใช้โหมด 18+ ได้' : 'ยังใช้โหมด 18+ ไม่ได้'}. แก้วันเกิดได้โดยแจ้งปัญหาถึงแอดมิน</span>
          </dd>
          <dt>แพ็กเกจ</dt>
          <dd>
            {planName}{' '}
            <Link className="link" href="/membership">
              ดูแพ็กเกจ
            </Link>
          </dd>
        </dl>

        <form className="account-section" onSubmit={changePassword}>
          <h3 className="editor-h">เปลี่ยนรหัสผ่าน</h3>
          <label className="field">
            <span className="field-label">รหัสผ่านปัจจุบัน</span>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <div className="grid-2">
            <label className="field">
              <span className="field-label">รหัสผ่านใหม่</span>
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="field">
              <span className="field-label">ยืนยันรหัสผ่านใหม่</span>
              <input type="password" value={confirmNext} onChange={(e) => setConfirmNext(e.target.value)} autoComplete="new-password" />
            </label>
          </div>
          {pwError && (
            <p className="form-error" role="alert">
              {pwError}
            </p>
          )}
          <button className="btn btn-soft" type="submit" disabled={pwBusy || !current || next.length < 8}>
            {pwBusy ? 'กำลังเปลี่ยน…' : 'เปลี่ยนรหัสผ่าน'}
          </button>
        </form>

        <div className="account-section account-danger">
          <h3 className="editor-h">ลบบัญชี</h3>
          {deleting ? (
            <>
              <p className="help warn">
                ลบบัญชี แชททุกเรื่อง และแพ็กเกจของคุณถาวร กู้คืนไม่ได้ ถ้ามีแพ็กเกจที่ต่ออายุอัตโนมัติ ให้ยกเลิกที่หน้าแพ็กเกจก่อน
              </p>
              <label className="field">
                <span className="field-label">ใส่รหัสผ่านเพื่อยืนยัน</span>
                <input type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" />
              </label>
              {deleteError && (
                <p className="form-error" role="alert">
                  {deleteError}
                </p>
              )}
              <span className="confirm">
                <button className="btn btn-ghost danger-btn" onClick={deleteAccount} disabled={deleteBusy || !deletePw}>
                  {deleteBusy ? 'กำลังลบ…' : 'ลบบัญชีถาวร'}
                </button>
                <button className="link" onClick={() => setDeleting(false)}>
                  ไม่ลบ
                </button>
              </span>
            </>
          ) : (
            <button className="btn btn-ghost danger-btn" onClick={() => setDeleting(true)}>
              ลบบัญชีของฉัน
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
