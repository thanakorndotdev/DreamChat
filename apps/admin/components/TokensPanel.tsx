'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import { formatPrice } from '@longrak/shared/plans';
import type { Economy } from '@longrak/shared/tokens';
import { adminFetch, errorText } from './api';

/** A pack as typed in the form: price in baht, as text, until it is saved. */
type PackDraft = { id: string; tokens: string; baht: string };

export default function TokensPanel({ toast }: { toast: (text: string) => void }) {
  const [messageCost, setMessageCost] = useState('');
  const [unlockPrice, setUnlockPrice] = useState('');
  const [packs, setPacks] = useState<PackDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const take = (e: Economy) => {
    setMessageCost(String(e.messageCost));
    setUnlockPrice(String(e.unlockPrice));
    setPacks(e.packs.map((p) => ({ id: p.id, tokens: String(p.tokens), baht: String(p.price / 100) })));
  };

  useEffect(() => {
    adminFetch<Economy>('/api/admin/economy')
      .then(take)
      .catch((e) => toast(errorText(e)));
  }, [toast]);

  if (!packs) return <p className="admin-loading">กำลังโหลด…</p>;

  const setPack = (i: number, patch: Partial<PackDraft>) => setPacks((list) => list && list.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        messageCost: Number(messageCost),
        unlockPrice: Number(unlockPrice),
        packs: packs.map((p) => ({ id: p.id, tokens: Number(p.tokens), price: Math.round(Number(p.baht) * 100) })),
      };
      take(await adminFetch<Economy>('/api/admin/economy', { method: 'PUT', body: JSON.stringify(body) }));
      toast('บันทึกราคาโทเคนแล้ว มีผลทันที');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">โทเคน</h1>
          <p className="admin-summary">
            พอข้อความฟรีของแพ็กเกจหมด (ตั้งได้ในแท็บแพ็กเกจ) ผู้ใช้จ่ายโทเคนต่อข้อความ หรือปลดล็อกคุยไม่จำกัดกับตัวละครนั้น ราคาปลดล็อกของแต่ละตัวตั้งได้ในคลังตัวละคร
          </p>
        </div>
      </div>

      <div className="form">
        <div className="grid-2">
          <label className="field">
            <span className="field-label">โทเคนต่อข้อความ</span>
            <input type="number" min={0} value={messageCost} onChange={(e) => setMessageCost(e.target.value)} />
            <span className="help">หักเมื่อข้อความฟรีหมด AI ตอบไม่สำเร็จจะคืนให้อัตโนมัติ</span>
          </label>
          <label className="field">
            <span className="field-label">ราคากลางปลดล็อกคุยไม่จำกัด (โทเคน)</span>
            <input type="number" min={0} value={unlockPrice} onChange={(e) => setUnlockPrice(e.target.value)} />
            <span className="help">ใช้กับตัวละครที่ผู้ใช้สร้างเอง และตัวในคลังที่ไม่ได้ตั้งราคาเอง</span>
          </label>
        </div>

        <fieldset className="field grant">
          <legend className="field-label">แพ็กโทเคนที่ขาย</legend>
          {packs.map((p, i) => (
            <div key={p.id} className="grid-2">
              <label className="field">
                <span className="field-label">จำนวนโทเคน</span>
                <input type="number" min={1} value={p.tokens} onChange={(e) => setPack(i, { tokens: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">ราคา (บาท)</span>
                <span className="code-row">
                  <input type="number" min={10} value={p.baht} onChange={(e) => setPack(i, { baht: e.target.value })} />
                  <button type="button" className="icon-btn" onClick={() => setPacks(packs.filter((_, j) => j !== i))} aria-label={`ลบแพ็ก ${p.tokens} โทเคน`}>
                    <Trash size={18} />
                  </button>
                </span>
                {Number(p.tokens) > 0 && Number(p.baht) > 0 && (
                  <span className="help">
                    {formatPrice(Math.round(Number(p.baht) * 100))} ได้ {Number(p.tokens).toLocaleString('th-TH')} โทเคน (โทเคนละ ฿
                    {(Number(p.baht) / Number(p.tokens)).toLocaleString('th-TH', { maximumFractionDigits: 3 })})
                  </span>
                )}
              </label>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPacks([...packs, { id: `p${Date.now().toString(36)}`, tokens: '', baht: '' }])}
          >
            <Plus size={18} weight="bold" />
            <span>เพิ่มแพ็ก</span>
          </button>
          <span className="help">ราคาต่ำสุด ฿10 ต่อแพ็ก (ขั้นต่ำของ Stripe) เปลี่ยนราคาแล้วมีผลกับการซื้อครั้งถัดไป</span>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </section>
  );
}
