'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import Modal from '@longrak/shared/components/Modal';
import { FREE_PLAN_ID, INTERVAL_LABEL, type Plan, formatPrice } from '@longrak/shared/plans';
import { adminFetch, errorText } from './api';

type AdminPlan = Plan & { members: number };

export default function PlansPanel({ toast }: { toast: (text: string) => void }) {
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    adminFetch<AdminPlan[]>('/api/admin/plans')
      .then(setPlans)
      .catch((e) => toast(errorText(e)));
  }, [toast]);
  useEffect(load, [load]);

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">แพ็กเกจ</h1>
          <p className="admin-summary">ราคา รอบบิล และลิมิตของแต่ละแพ็กเกจ ระบบบังคับลิมิตที่เซิร์ฟเวอร์ แก้แล้วมีผลทันที</p>
        </div>
        <div className="admin-head-tools">
          <button className="btn btn-ghost" onClick={() => setCreating(true)}>
            <Plus size={18} weight="bold" />
            <span>เพิ่มแพ็กเกจ</span>
          </button>
        </div>
      </div>

      {plans === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>แพ็กเกจ</th>
              <th>ราคา</th>
              <th>ฟรี/วัน</th>
              <th>ฟรี/ตัวละคร</th>
              <th>เช็คอิน</th>
              <th>ความจำ</th>
              <th>เรื่องสูงสุด</th>
              <th>สมาชิก</th>
              <th>สถานะ</th>
              <th aria-label="จัดการ" />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td data-label="แพ็กเกจ" className="admin-name">
                  {p.name}
                </td>
                <td data-label="ราคา">{p.price ? `${formatPrice(p.price)}/${INTERVAL_LABEL[p.interval]}` : 'ฟรี'}</td>
                <td data-label="ฟรี/วัน">{p.features.dailyMessages || 'ไม่จำกัด'}</td>
                <td data-label="ฟรี/ตัวละคร">{p.features.freePerCharacter || 'ไม่จำกัด'}</td>
                <td data-label="เช็คอิน">{p.features.checkinTokens ? `${p.features.checkinTokens} โทเคน/วัน` : '—'}</td>
                <td data-label="ความจำ">
                  {p.features.historyWindow} ข้อความ, {p.features.memoryNotes} บันทึก
                </td>
                <td data-label="เรื่องสูงสุด">{p.features.maxCharacters || 'ไม่จำกัด'}</td>
                <td data-label="สมาชิก">{p.id === FREE_PLAN_ID ? '—' : p.members}</td>
                <td data-label="สถานะ">{p.active ? 'เปิดขาย' : 'ปิดขาย'}</td>
                <td className="admin-actions">
                  <button className="btn btn-soft" onClick={() => setEditing(p)}>
                    แก้ไข
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <PlanModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast(`บันทึก ${editing.name} แล้ว`);
            setEditing(null);
            load();
          }}
        />
      )}
      {creating && (
        <NewPlanModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            toast('เพิ่มแพ็กเกจแล้ว ตั้งราคาและกดเปิดขายเมื่อพร้อม');
            setCreating(false);
            load();
          }}
        />
      )}
    </section>
  );
}

function PlanModal({ plan, onClose, onSaved }: { plan: AdminPlan; onClose: () => void; onSaved: () => void }) {
  const free = plan.id === FREE_PLAN_ID;
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(String(plan.price / 100));
  const [interval, setInterval] = useState(plan.interval);
  const [level, setLevel] = useState(plan.level);
  const [active, setActive] = useState(plan.active);
  const [f, setF] = useState(plan.features);
  const [perks, setPerks] = useState(plan.perks.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const num = (key: 'dailyMessages' | 'freePerCharacter' | 'checkinTokens' | 'historyWindow' | 'memoryNotes' | 'maxCharacters', v: string) => setF((x) => ({ ...x, [key]: Number(v) || 0 }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await adminFetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, price: Math.round(Number(price) * 100), interval, level, active, features: f, perks: perks.split('\n') }),
      });
      onSaved();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`แก้ไข ${plan.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </>
      }
    >
      <div className="form">
        <div className="grid-2">
          <label className="field">
            <span className="field-label">ชื่อแพ็กเกจ</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {!free && (
            <label className="field">
              <span className="field-label">ระดับ</span>
              <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                <option value={1}>Plus (คุยตัวละคร Plus ได้)</option>
                <option value={2}>Pro (คุยได้ทุกตัว)</option>
              </select>
            </label>
          )}
          {!free && (
            <label className="field">
              <span className="field-label">ราคา (บาท)</span>
              <input type="number" min={10} step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
          )}
          {!free && (
            <label className="field">
              <span className="field-label">รอบบิล (ต่ออายุอัตโนมัติ)</span>
              <select value={interval} onChange={(e) => setInterval(e.target.value as Plan['interval'])}>
                <option value="month">ทุกเดือน</option>
                <option value="year">ทุกปี</option>
              </select>
            </label>
          )}
          <label className="field">
            <span className="field-label">ข้อความฟรีต่อวัน</span>
            <input type="number" min={0} value={f.dailyMessages} onChange={(e) => num('dailyMessages', e.target.value)} />
            <span className="help">0 = ไม่จำกัดต่อวัน เกินแล้วใช้โทเคน</span>
          </label>
          <label className="field">
            <span className="field-label">ข้อความฟรีต่อตัวละคร</span>
            <input type="number" min={0} value={f.freePerCharacter ?? 0} onChange={(e) => num('freePerCharacter', e.target.value)} />
            <span className="help">นับรวมตลอด 0 = ไม่จำกัด เกินแล้วใช้โทเคนหรือปลดล็อกตัวนั้น</span>
          </label>
          <label className="field">
            <span className="field-label">โทเคนเช็คอินรายวัน</span>
            <input type="number" min={0} value={f.checkinTokens ?? 0} onChange={(e) => num('checkinTokens', e.target.value)} />
            <span className="help">0 = ไม่มีเช็คอิน</span>
          </label>
          <label className="field">
            <span className="field-label">เรื่องสูงสุดต่อบัญชี</span>
            <input type="number" min={0} value={f.maxCharacters} onChange={(e) => num('maxCharacters', e.target.value)} />
            <span className="help">0 = ไม่จำกัด</span>
          </label>
          <label className="field">
            <span className="field-label">ความจำระยะสั้น (ข้อความล่าสุด)</span>
            <input type="number" min={1} value={f.historyWindow} onChange={(e) => num('historyWindow', e.target.value)} />
            <span className="help">ยิ่งมาก AI ยิ่งต่อเรื่องได้ดี แต่ใช้เครดิตมากขึ้น</span>
          </label>
          <label className="field">
            <span className="field-label">ความจำระยะยาว (บันทึกเรื่อง)</span>
            <input type="number" min={0} value={f.memoryNotes} onChange={(e) => num('memoryNotes', e.target.value)} />
            <span className="help">0 = ปิดการจดบันทึก</span>
          </label>
        </div>
        <label className="field">
          <span className="field-label">โมเดล AI</span>
          <input value={f.model} onChange={(e) => setF((x) => ({ ...x, model: e.target.value }))} placeholder="เว้นว่าง ใช้โมเดลหลักในหน้าตั้งค่า" list="plan-models" spellCheck={false} />
          <datalist id="plan-models">
            <option value="@cf/meta/llama-3.1-8b-instruct-fp8" />
            <option value="@cf/google/gemma-4-26b-a4b-it" />
            <option value="@cf/aisingapore/gemma-sea-lion-v4-27b-it" />
          </datalist>
        </label>
        <label className="field">
          <span className="field-label">จุดเด่นที่แสดงในหน้าสมัคร (บรรทัดละข้อ)</span>
          <textarea rows={6} value={perks} onChange={(e) => setPerks(e.target.value)} />
        </label>
        {!free && (
          <label className="toggle admin-toggle">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>
              <span className="toggle-title">เปิดขาย</span>
              <span className="help">ปิดแล้วคนที่สมัครอยู่ยังใช้ต่อได้ แต่สมัครใหม่ไม่ได้ เปลี่ยนราคาแล้วมีผลกับคนสมัครใหม่</span>
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

function NewPlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    try {
      await adminFetch('/api/admin/plans', { method: 'POST', body: JSON.stringify({ id, name }) });
      onCreated();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Modal
      title="เพิ่มแพ็กเกจ"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn btn-primary" onClick={create} disabled={!id || !name.trim()}>
            เพิ่ม
          </button>
        </>
      }
    >
      <div className="form">
        <label className="field">
          <span className="field-label">รหัสแพ็กเกจ</span>
          <input value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="เช่น plus-monthly" />
          <span className="help">a-z 0-9 และ - เปลี่ยนภายหลังไม่ได้</span>
        </label>
        <label className="field">
          <span className="field-label">ชื่อที่แสดง</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น Rakkao Plus รายเดือน" />
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
