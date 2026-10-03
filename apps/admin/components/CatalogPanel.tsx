'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash } from '@phosphor-icons/react';
import { type CatalogEntry, type CatalogStatus, type CharacterSheet, STATUS_LABEL } from '@longrak/shared/catalog';
import { fileToAvatar } from '@longrak/shared/image';
import { TIER_LABEL } from '@longrak/shared/plans';
import { adminFetch, errorText, formatDate } from './api';

type Filter = 'all' | CatalogStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'รอตรวจ' },
  { id: 'published', label: 'เผยแพร่แล้ว' },
  { id: 'draft', label: 'ฉบับร่าง' },
  { id: 'rejected', label: 'ไม่ผ่าน' },
  { id: 'all', label: 'ทั้งหมด' },
];

const EMPTY_SHEET: CharacterSheet = { name: '', role: '', gender: '', age: '', job: '', avatar: '', personality: '', firstMessage: '', userRole: '', adult: false };

export default function CatalogPanel({ toast }: { toast: (text: string) => void }) {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [open, setOpen] = useState<CatalogEntry | 'new' | null>(null);

  const load = useCallback(() => {
    adminFetch<CatalogEntry[]>('/api/admin/catalog')
      .then((list) => {
        setEntries(list);
        // Nothing waiting: start on what's live instead of an empty queue.
        setFilter((f) => (f === 'pending' && !list.some((e) => e.status === 'pending') ? 'published' : f));
      })
      .catch((e) => toast(errorText(e)));
  }, [toast]);

  useEffect(load, [load]);

  if (open) {
    return (
      <CatalogEditor
        entry={open === 'new' ? null : open}
        toast={toast}
        onClose={(changed) => {
          setOpen(null);
          if (changed) load();
        }}
      />
    );
  }

  const count = (f: Filter) => (entries ?? []).filter((e) => f === 'all' || e.status === f).length;
  const shown = (entries ?? []).filter((e) => filter === 'all' || e.status === filter);

  return (
    <section className="admin-panel">
      <div className="admin-head">
        <div>
          <h1 className="section-title">คลังตัวละคร</h1>
          <p className="admin-summary">ตัวละครที่ผู้ใช้เลือกคุยได้ คำขอเผยแพร่จากผู้ใช้มีแค่ข้อมูลตัวละคร ไม่มีแชท</p>
        </div>
        <div className="admin-head-tools">
          <button className="btn btn-primary" onClick={() => setOpen('new')}>
            <Plus size={18} weight="bold" />
            <span>สร้างตัวละคร</span>
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="สถานะ">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} ({count(f.id)})
          </button>
        ))}
      </div>

      {entries === null ? (
        <p className="admin-loading">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <p className="admin-loading">{filter === 'pending' ? 'ไม่มีคำขอรอตรวจ' : 'ไม่มีตัวละครในหมวดนี้'}</p>
      ) : (
        <ul className="admin-chars">
          {shown.map((e) => (
            <li key={e.id}>
              <button onClick={() => setOpen(e)}>
                {e.sheet.avatar ? <img src={e.sheet.avatar} alt="" loading="lazy" /> : <span className="admin-noimg" />}
                <span className="admin-char-text">
                  <span className="admin-char-name">
                    {e.sheet.name || '(ไม่มีชื่อ)'}
                    {e.sheet.adult && <span className="badge-adult">18+</span>}
                  </span>
                  <span className="admin-char-role">{e.sheet.role}</span>
                  <span className="admin-char-meta">
                    <span className="pub-status" data-status={e.status}>
                      {STATUS_LABEL[e.status]}
                    </span>{' '}
                    {TIER_LABEL[e.tier]}, {e.author ? `โดย ${e.author}` : 'โดยระบบ'}, {formatDate(e.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type TextKey = Exclude<keyof CharacterSheet, 'adult' | 'avatar'>;

const SHORT: { key: TextKey; label: string }[] = [
  { key: 'name', label: 'ชื่อ' },
  { key: 'role', label: 'บทบาท' },
  { key: 'gender', label: 'เพศ' },
  { key: 'age', label: 'อายุ' },
  { key: 'job', label: 'อาชีพ' },
];

const LONG: { key: TextKey; label: string; rows: number; help?: string }[] = [
  { key: 'personality', label: 'นิสัยและปูมหลัง', rows: 8 },
  { key: 'firstMessage', label: 'ข้อความแรก', rows: 4, help: 'ใส่ *ท่าทาง* ในดอกจัน' },
  { key: 'userRole', label: 'ผู้เล่นเป็นใครในเรื่อง', rows: 2 },
];

function CatalogEditor({ entry, toast, onClose }: { entry: CatalogEntry | null; toast: (t: string) => void; onClose: (changed: boolean) => void }) {
  const [sheet, setSheet] = useState<CharacterSheet>(entry?.sheet ?? EMPTY_SHEET);
  const [tier, setTier] = useState(entry?.tier ?? 0);
  const [unlockPrice, setUnlockPrice] = useState(entry?.unlockPrice == null ? '' : String(entry.unlockPrice));
  const [note, setNote] = useState(entry?.reviewNote ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof CharacterSheet>(key: K, value: CharacterSheet[K]) => setSheet((s) => ({ ...s, [key]: value }));

  const save = async (status: CatalogStatus, done: string) => {
    setBusy(true);
    try {
      if (entry) {
        await adminFetch(`/api/admin/catalog/${encodeURIComponent(entry.id)}`, { method: 'PATCH', body: JSON.stringify({ sheet, tier, unlockPrice, status, reviewNote: note }) });
      } else {
        await adminFetch('/api/admin/catalog', { method: 'POST', body: JSON.stringify({ sheet, tier, unlockPrice, status }) });
      }
      toast(done);
      onClose(true);
    } catch (e) {
      toast(errorText(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      await adminFetch(`/api/admin/catalog/${encodeURIComponent(entry!.id)}`, { method: 'DELETE' });
      toast(`ลบ ${sheet.name} ออกจากคลังแล้ว`);
      onClose(true);
    } catch (e) {
      toast(errorText(e));
    }
  };

  const pending = entry?.status === 'pending';

  return (
    <section className="admin-panel editor">
      <div className="editor-bar">
        <button className="icon-btn" onClick={() => onClose(false)} aria-label="กลับไปคลังตัวละคร">
          <ArrowLeft size={20} />
        </button>
        <div className="editor-title">
          <h1 className="section-title">{entry ? sheet.name || '(ไม่มีชื่อ)' : 'สร้างตัวละครในคลัง'}</h1>
          {entry && (
            <p className="admin-summary">
              {STATUS_LABEL[entry.status]}, {entry.author ? `ส่งโดย ${entry.author}` : 'สร้างโดยระบบ'}
            </p>
          )}
        </div>
      </div>

      <div className="editor-info">
        <div className="editor-cover">
          {sheet.avatar ? <img className="book" src={sheet.avatar} alt="" /> : <span className="admin-noimg book" />}
          <label className="btn btn-soft">
            {sheet.avatar ? 'เปลี่ยนรูปปก' : 'ใส่รูปปก'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  set('avatar', await fileToAvatar(file));
                } catch (err) {
                  toast(errorText(err));
                }
              }}
            />
          </label>
          <label className="field">
            <span className="field-label">หรือใส่ URL รูป</span>
            <input value={sheet.avatar.startsWith('data:') ? '' : sheet.avatar} onChange={(e) => set('avatar', e.target.value)} placeholder="https://…" />
          </label>
        </div>

        <div className="form">
          <div className="grid-2">
            {SHORT.map((f) => (
              <label key={f.key} className="field">
                <span className="field-label">{f.label}</span>
                <input value={sheet[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              </label>
            ))}
            <label className="field">
              <span className="field-label">ใครคุยได้</span>
              <select value={tier} onChange={(e) => setTier(Number(e.target.value))}>
                {TIER_LABEL.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">ราคาปลดล็อกคุยไม่จำกัด (โทเคน)</span>
              <input type="number" min={0} value={unlockPrice} onChange={(e) => setUnlockPrice(e.target.value)} placeholder="เว้นว่าง ใช้ราคากลางในแท็บโทเคน" />
            </label>
          </div>
          {LONG.map((f) => (
            <label key={f.key} className="field">
              <span className="field-label">{f.label}</span>
              <textarea rows={f.rows} value={sheet[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              {f.help && <span className="help">{f.help}</span>}
            </label>
          ))}
          <label className="toggle">
            <input type="checkbox" checked={!!sheet.adult} onChange={(e) => set('adult', e.target.checked)} />
            <span>
              <span className="toggle-title">เปิดโหมดหยาบ 18+ ได้</span>
              <span className="help">ตัวละครและผู้เล่นต้องอายุ 18 ปีขึ้นไป</span>
            </span>
          </label>
          {entry?.author && (
            <label className="field">
              <span className="field-label">หมายเหตุถึงผู้ส่ง</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เหตุผลที่ไม่ผ่าน หรือสิ่งที่ควรแก้" />
              <span className="help">ผู้ส่งเห็นข้อความนี้เมื่อไม่ผ่านการตรวจ</span>
            </label>
          )}

          <div className="settings-actions">
            {pending ? (
              <>
                <button className="btn btn-primary" disabled={busy || !sheet.name.trim()} onClick={() => save('published', 'อนุมัติและเผยแพร่แล้ว')}>
                  อนุมัติและเผยแพร่
                </button>
                <button className="btn btn-ghost danger-btn" disabled={busy} onClick={() => save('rejected', 'ตีกลับแล้ว')}>
                  ไม่ผ่าน
                </button>
              </>
            ) : entry?.status === 'published' ? (
              <>
                <button className="btn btn-primary" disabled={busy || !sheet.name.trim()} onClick={() => save('published', 'บันทึกแล้ว')}>
                  บันทึก
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => save('draft', 'ซ่อนจากคลังแล้ว')}>
                  ซ่อนจากคลัง
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" disabled={busy || !sheet.name.trim()} onClick={() => save('published', 'เผยแพร่แล้ว')}>
                  เผยแพร่
                </button>
                <button className="btn btn-ghost" disabled={busy || !sheet.name.trim()} onClick={() => save(entry?.status ?? 'draft', 'บันทึกแล้ว')}>
                  บันทึกไว้ก่อน
                </button>
              </>
            )}
          </div>

          {entry && (
            <div className="editor-danger">
              {confirmDelete ? (
                <span className="confirm">
                  <span className="confirm-q">ลบออกจากคลัง? คนที่คุยอยู่แล้วยังคุยต่อได้</span>
                  <button className="link danger" onClick={remove}>
                    ลบเลย
                  </button>
                  <button className="link" onClick={() => setConfirmDelete(false)}>
                    ไม่ลบ
                  </button>
                </span>
              ) : (
                <button className="btn btn-ghost danger-btn" onClick={() => setConfirmDelete(true)}>
                  <Trash size={16} /> ลบออกจากคลัง
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
