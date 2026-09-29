'use client';

import { useState } from 'react';
import Modal from './Modal';
import StatusDot from './StatusDot';
import type { useOllama } from '@/lib/store';

type Props = {
  ollama: ReturnType<typeof useOllama>;
  onClose: () => void;
  onSaved: (ok: boolean) => void;
};

export default function SettingsDialog({ ollama, onClose, onSaved }: Props) {
  const [host, setHost] = useState(ollama.host);
  const [model, setModel] = useState(ollama.model);

  const save = async () => {
    const ok = await ollama.save(host.trim() || 'http://localhost:11434', model.trim() || 'llama3.1:8b');
    onSaved(ok);
    onClose();
  };

  const modelMissing = ollama.status === 'online' && ollama.models.length > 0 && !ollama.models.includes(model.trim());

  return (
    <Modal
      title="ตั้งค่า Ollama"
      subtitle={<StatusDot status={ollama.status} />}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn btn-primary" onClick={save}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="host">Host URL</label>
        <div className="field-row">
          <input id="host" className="mono" value={host} onChange={(e) => setHost(e.target.value)} />
          <button className="btn btn-ghost" type="button" onClick={() => ollama.check(host.trim())}>
            ทดสอบ
          </button>
        </div>
        <p className="help">แอปเชื่อมต่อผ่านเซิร์ฟเวอร์ Next.js จึงไม่ต้องตั้งค่า OLLAMA_ORIGINS</p>
      </div>

      <div className="field">
        <label htmlFor="model">โมเดล</label>
        <input id="model" className="mono" list="model-list" value={model} onChange={(e) => setModel(e.target.value)} />
        <datalist id="model-list">
          {ollama.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {ollama.models.length > 0 && (
          <div className="chips">
            {ollama.models.map((m) => (
              <button key={m} type="button" className="chip" data-active={m === model || undefined} onClick={() => setModel(m)}>
                {m}
              </button>
            ))}
          </div>
        )}
        <p className="help">
          {modelMissing ? (
            <span className="warn">ไม่พบโมเดลนี้ในเครื่อง รัน ollama pull {model.trim()} ก่อน</span>
          ) : (
            'ต้องตรงกับชื่อที่ใช้ตอน ollama pull'
          )}
        </p>
      </div>
    </Modal>
  );
}
