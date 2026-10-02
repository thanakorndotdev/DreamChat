'use client';

import { useCallback, useEffect, useState } from 'react';
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import Modal from '@longrak/shared/components/Modal';
import type { Coupon } from '@longrak/shared/api-types';
import { FREE_PLAN_ID, type Plan, formatPrice } from '@longrak/shared/plans';
import { adminFetch, errorText, formatDate } from './api';

function describe(c: Coupon, plans: Plan[]) {
  const what =
    c.kind === 'percent'
      ? `ลด ${c.value}%${c.duration === 'forever' ? ' ทุกรอบ' : ' รอบแรก'}`
      : c.kind === 'amount'
        ? `ลด ${formatPrice(c.value)}${c.duration === 'forever' ? ' ทุกรอบ' : ' รอบแรก'}`
        : `ใช้ฟรี ${c.value} วัน`;
  const names = c.planIds?.map((id) => plans.find((p) => p.id === id)?.name ?? id).join(', ');
  return `${what}${names ? ` (${names})` : ''}`;
}

export default function CouponsPanel({ toast }: { toast: (text: string) => void }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(() => {
    adminFetch<Coupon[]>('/api/admin/coupons')
      .then(setCoupons)
      .catch((e) => toast(errorText(e)));
  }, [toast]);
  useEffect(load, [load]);
  useEffect(() => {
    adminFetch<Plan[]>('/api/admin/plans')
      .then((p) => setPlans(p.filter((x) => x.id !== FREE_PLAN_ID)))
      .catch(() => {});
  }, []);

  const remove = async (code: string) => {
    try {
      await adminFetch(`/api/admin/coupons/${encodeURIComponent(code)}`, { method: 'DELETE' });
      toast(`ลบโค้ด ${code} แล้ว`);
      setConfirm(null);
      load();
    } catch (e) {
      toast(errorText(e));
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">โค้ดส่วนลด</h1>
          <p className="admin-summary">ลดเป็นเปอร์เซ็นต์ ลดเป็นบาท หรือให้ใช้แพ็กเกจฟรีตามจำนวนวัน กำหนดจำนวนคนที่ใช้ได้หรือไม่จำกัดก็ได้</p>
        </div>
        <div className="admin-head-tools">
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} weight="bold" />
            <span>สร้างโค้ด</span>
          </button>
        </div>
      </div>

      {coupons === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : coupons.length === 0 ? (
        <p className="admin-loading">ยังไม่มีโค้ด</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>โค้ด</th>
              <th>สิทธิ์</th>
              <th>ใช้ไปแล้ว</th>
              <th>หมดอายุ</th>
              <th>สถานะ</th>
              <th aria-label="จัดการ" />
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => {
              const used = c.maxRedemptions !== null && c.redemptions >= c.maxRedemptions;
              const expired = !!c.expiresAt && c.expiresAt < Date.now();
              return (
                <tr key={c.code}>
                  <td data-label="โค้ด" className="admin-name">
                    {c.code}
                    {c.note && <span className="admin-char-meta"> {c.note}</span>}
                  </td>
                  <td data-label="สิทธิ์">{describe(c, plans)}</td>
                  <td data-label="ใช้ไปแล้ว">
                    {c.redemptions} / {c.maxRedemptions ?? 'ไม่จำกัด'} คน
                  </td>
                  <td data-label="หมดอายุ">{c.expiresAt ? formatDate(c.expiresAt) : 'ไม่หมดอายุ'}</td>
                  <td data-label="สถานะ">{!c.active ? 'ปิดใช้' : expired ? 'หมดอายุ' : used ? 'ใช้ครบแล้ว' : 'ใช้ได้'}</td>
                  <td className="admin-actions">
                    {confirm === c.code ? (
                      <span className="confirm">
                        <span className="confirm-q">ลบโค้ดและประวัติการใช้?</span>
                        <button className="link danger" onClick={() => remove(c.code)}>
                          ลบเลย
                        </button>
                        <button className="link" onClick={() => setConfirm(null)}>
                          ไม่ลบ
                        </button>
                      </span>
                    ) : (
                      <>
                        <button className="icon-btn" onClick={() => setEditing(c)} aria-label={`แก้ไข ${c.code}`}>
                          <PencilSimple size={18} />
                        </button>
                        <button className="icon-btn" onClick={() => setConfirm(c.code)} aria-label={`ลบ ${c.code}`}>
                          <Trash size={18} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <CouponModal
          coupon={editing === 'new' ? null : editing}
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

const toDateInput = (ts: number | null) => (ts ? new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');

function CouponModal({ coupon, plans, onClose, onSaved }: { coupon: Coupon | null; plans: Plan[]; onClose: () => void; onSaved: (t: string) => void }) {
  const [code, setCode] = useState(coupon?.code ?? '');
  const [kind, setKind] = useState<Coupon['kind']>(coupon?.kind ?? 'percent');
  const [value, setValue] = useState(coupon ? String(coupon.kind === 'amount' ? coupon.value / 100 : coupon.value) : '');
  const [duration, setDuration] = useState<Coupon['duration']>(coupon?.duration ?? 'once');
  const [planIds, setPlanIds] = useState<string[]>(coupon?.planIds ?? []);
  const [limited, setLimited] = useState(coupon ? coupon.maxRedemptions !== null : false);
  const [max, setMax] = useState(String(coupon?.maxRedemptions ?? 100));
  const [expires, setExpires] = useState(toDateInput(coupon?.expiresAt ?? null));
  const [active, setActive] = useState(coupon?.active ?? true);
  const [note, setNote] = useState(coupon?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const togglePlan = (id: string) =>
    setPlanIds((list) => (kind === 'free_days' ? [id] : list.includes(id) ? list.filter((p) => p !== id) : [...list, id]));

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = {
      code,
      kind,
      value: kind === 'amount' ? Math.round(Number(value) * 100) : Number(value),
      duration,
      planIds,
      maxRedemptions: limited ? Number(max) : null,
      // End of the chosen day, Thailand time.
      expiresAt: expires ? new Date(`${expires}T23:59:59+07:00`).getTime() : null,
      active,
      note,
    };
    try {
      if (coupon) await adminFetch(`/api/admin/coupons/${encodeURIComponent(coupon.code)}`, { method: 'PUT', body: JSON.stringify(body) });
      else await adminFetch('/api/admin/coupons', { method: 'POST', body: JSON.stringify(body) });
      onSaved(coupon ? `บันทึกโค้ด ${coupon.code} แล้ว` : `สร้างโค้ด ${code.toUpperCase()} แล้ว`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={coupon ? `แก้ไขโค้ด ${coupon.code}` : 'สร้างโค้ด'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !code || !value}>
            {busy ? 'กำลังบันทึก…' : coupon ? 'บันทึก' : 'สร้างโค้ด'}
          </button>
        </>
      }
    >
      <div className="form">
        <div className="grid-2">
          <label className="field">
            <span className="field-label">โค้ด</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} disabled={!!coupon} placeholder="เช่น RAKKAO50" />
          </label>
          <label className="field">
            <span className="field-label">ประเภท</span>
            <select
              value={kind}
              onChange={(e) => {
                const k = e.target.value as Coupon['kind'];
                setKind(k);
                if (k === 'free_days') setPlanIds((l) => l.slice(0, 1));
              }}
            >
              <option value="percent">ลดเป็นเปอร์เซ็นต์</option>
              <option value="amount">ลดเป็นบาท</option>
              <option value="free_days">ใช้แพ็กเกจฟรี (วัน)</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{kind === 'percent' ? 'ลดกี่ %' : kind === 'amount' ? 'ลดกี่บาท' : 'ใช้ฟรีกี่วัน'}</span>
            <input type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} />
            {kind === 'percent' && <span className="help">100 = ฟรีรอบแรก แต่ยังต้องผูกบัตรสำหรับรอบถัดไป</span>}
            {kind === 'free_days' && <span className="help">ไม่ต้องผูกบัตร หมดแล้วกลับเป็น Free</span>}
          </label>
          {kind !== 'free_days' && (
            <label className="field">
              <span className="field-label">ลดกี่รอบ</span>
              <select value={duration} onChange={(e) => setDuration(e.target.value as Coupon['duration'])}>
                <option value="once">เฉพาะรอบแรก</option>
                <option value="forever">ทุกรอบตลอดการเป็นสมาชิก</option>
              </select>
            </label>
          )}
        </div>

        <fieldset className="field coupon-plans">
          <legend className="field-label">{kind === 'free_days' ? 'ให้แพ็กเกจไหน (เลือก 1)' : 'ใช้กับแพ็กเกจ (ไม่เลือก = ทุกแพ็กเกจ)'}</legend>
          {plans.map((p) => (
            <label key={p.id} className="editor-check">
              <input type={kind === 'free_days' ? 'radio' : 'checkbox'} name="coupon-plan" checked={planIds.includes(p.id)} onChange={() => togglePlan(p.id)} />
              {p.name}
            </label>
          ))}
        </fieldset>

        <div className="grid-2">
          <label className="field">
            <span className="field-label">จำนวนคนที่ใช้ได้</span>
            <select value={limited ? 'limited' : 'all'} onChange={(e) => setLimited(e.target.value === 'limited')}>
              <option value="all">ไม่จำกัด ทุกคนใช้ได้</option>
              <option value="limited">จำกัดจำนวนคน</option>
            </select>
          </label>
          {limited && (
            <label className="field">
              <span className="field-label">ใช้ได้กี่คน</span>
              <input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
              {coupon && <span className="help">ใช้ไปแล้ว {coupon.redemptions} คน</span>}
            </label>
          )}
          <label className="field">
            <span className="field-label">หมดอายุ</span>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
            <span className="help">เว้นว่าง = ไม่หมดอายุ</span>
          </label>
          <label className="field">
            <span className="field-label">หมายเหตุ (เห็นเฉพาะแอดมิน)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น แคมเปญเปิดตัว" />
          </label>
        </div>
        <p className="help">แต่ละบัญชีใช้โค้ดเดียวกันได้ครั้งเดียว</p>
        <label className="toggle admin-toggle">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>
            <span className="toggle-title">เปิดใช้โค้ด</span>
          </span>
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
