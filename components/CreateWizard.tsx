'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Shuffle, Sparkle } from '@phosphor-icons/react';
import Modal from './Modal';
import { BOT_PRESETS, DEFAULT_AVATAR, IMAGE_THEMES, USER_PRESETS, pick } from '@/lib/presets';
import type { Character } from '@/lib/types';

const STEPS = ['ตัวละคร', 'บทบาทคุณ', 'รูปภาพ'];

const EMPTY = {
  name: '',
  role: '',
  gender: 'หญิง',
  age: '20 ปี',
  job: 'นักศึกษา',
  personality: '',
  firstMessage: '',
  userName: 'ผู้เล่น',
  userGender: 'ชาย',
  userAge: '21 ปี',
  userJob: 'นักศึกษา',
  userRole: 'เพื่อนสนิทสมัยเด็กที่รู้ความลับของกันและกัน',
};

const STYLE_TAGS =
  'korean manhwa webtoon style, romance novel cover art, semi-realistic digital painting, delicate porcelain skin, soft glossy lips, sparkling eyes, warm soft ambient lighting, highly detailed, trending on artstation';

async function toEnglish(prompt: string) {
  if (!/[ก-๙]/.test(prompt)) return prompt;
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(prompt)}&langpair=th|en`);
    const data = await res.json();
    return data?.responseData?.translatedText || prompt;
  } catch {
    return prompt;
  }
}

export default function CreateWizard({ onClose, onCreate }: { onClose: () => void; onCreate: (c: Character) => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageState, setImageState] = useState<{ busy: boolean; text?: string; error?: string }>({ busy: false });

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
  };

  const randomBot = () => {
    const { imagePrompt: p, ...rest } = pick(BOT_PRESETS);
    setForm((f) => ({ ...f, ...rest }));
    setImagePrompt(p);
    setError(null);
  };

  const randomUser = () => {
    setForm((f) => ({ ...f, ...pick(USER_PRESETS) }));
    setError(null);
  };

  const generateImage = async (prompt = imagePrompt) => {
    if (!prompt.trim()) {
      setImageState({ busy: false, error: 'พิมพ์คำบรรยายภาพก่อน' });
      return;
    }
    setImageState({ busy: true, text: 'กำลังแปลคำบรรยาย…' });
    const english = await toEnglish(prompt.trim());
    setImageState({ busy: true, text: 'กำลังวาดภาพ อาจใช้เวลาสักครู่…' });
    const seed = Math.floor(Math.random() * 100000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(`${english}, ${STYLE_TAGS}`)}?width=600&height=800&nologo=true&seed=${seed}`;
    const img = new Image();
    img.onload = () => {
      setAvatar(url);
      setImageState({ busy: false });
    };
    img.onerror = () => setImageState({ busy: false, error: 'โหลดภาพไม่สำเร็จ ลองกดสร้างภาพอีกครั้ง' });
    img.src = url;
  };

  const next = () => {
    if (step === 0 && !form.name.trim()) return setError('ใส่ชื่อตัวละครก่อนไปขั้นถัดไป');
    if (step === 1 && !form.userName.trim()) return setError('ใส่ชื่อที่อยากให้ตัวละครเรียกคุณ');
    setError(null);
    if (step < 2) return setStep(step + 1);

    const firstMessage = form.firstMessage.trim() || '*หันมามองคุณแล้วส่งยิ้มบางๆ* ยินดีที่ได้เจอนะ!';
    onCreate({
      id: `char-${Date.now()}`,
      name: form.name.trim(),
      role: form.role.trim() || 'เพื่อนร่วมทาง',
      gender: form.gender,
      age: form.age.trim() || '-',
      job: form.job.trim() || '-',
      personality: form.personality.trim() || 'เป็นมิตร อบอุ่น และใส่ใจ',
      firstMessage,
      userName: form.userName.trim(),
      userRole: form.userRole.trim() || 'เพื่อนสนิท',
      userGender: form.userGender,
      userAge: form.userAge.trim(),
      userJob: form.userJob.trim(),
      avatar,
      messages: [{ sender: 'char', text: firstMessage }],
      updatedAt: Date.now(),
    });
  };

  return (
    <Modal
      title="สร้างตัวละคร"
      wide
      onClose={onClose}
      subtitle={
        <ol className="steps">
          {STEPS.map((label, i) => (
            <li key={label} data-state={i === step ? 'current' : i < step ? 'done' : undefined}>
              <span className="step-num">{i < step ? <Check size={12} weight="bold" /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      }
      footer={
        <>
          {step > 0 && (
            <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} /> ย้อนกลับ
            </button>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary push" onClick={next} disabled={imageState.busy}>
            {step === 2 ? 'เริ่มคุย' : 'ถัดไป'} {step < 2 && <ArrowRight size={16} />}
          </button>
        </>
      }
    >
      {step === 0 && (
        <div className="form">
          <div className="form-lead">
            <p>ตัวละครที่ AI จะสวมบทบาท</p>
            <button type="button" className="btn btn-soft" onClick={randomBot}>
              <Shuffle size={16} /> สุ่มตัวอย่าง
            </button>
          </div>
          <div className="grid-2">
            <Field label="ชื่อ" required>
              <input value={form.name} onChange={set('name')} placeholder="เช่น ไอริส" aria-invalid={!!error && !form.name} />
            </Field>
            <Field label="คอนเซปต์">
              <input value={form.role} onChange={set('role')} placeholder="เช่น สาวข้างบ้านปากร้ายใจดี" />
            </Field>
          </div>
          <div className="grid-3">
            <Field label="เพศ">
              <select value={form.gender} onChange={set('gender')}>
                <option>หญิง</option>
                <option>ชาย</option>
                <option>อื่นๆ</option>
              </select>
            </Field>
            <Field label="อายุ">
              <input value={form.age} onChange={set('age')} />
            </Field>
            <Field label="อาชีพ">
              <input value={form.job} onChange={set('job')} />
            </Field>
          </div>
          <Field label="นิสัย ปูมหลัง และวิธีตอบ">
            <textarea rows={4} value={form.personality} onChange={set('personality')} placeholder="เช่น ปากร้ายแต่ใจดี แอบเป็นห่วงเสมอ…" />
          </Field>
          <Field label="ประโยคเปิดเรื่อง" hint="ใส่ *ท่าทาง* ในเครื่องหมายดอกจัน">
            <textarea rows={3} value={form.firstMessage} onChange={set('firstMessage')} placeholder="*ยืนมองคุณจากหน้าประตู* มาช้านะ…" />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="form">
          <div className="form-lead">
            <p>ตัวคุณในเรื่องนี้ ตัวละครจะเรียกและปฏิบัติกับคุณตามนี้</p>
            <button type="button" className="btn btn-soft" onClick={randomUser}>
              <Shuffle size={16} /> สุ่มตัวอย่าง
            </button>
          </div>
          <Field label="ชื่อที่ให้ตัวละครเรียก" required>
            <input value={form.userName} onChange={set('userName')} aria-invalid={!!error && !form.userName} />
          </Field>
          <div className="grid-3">
            <Field label="เพศ">
              <select value={form.userGender} onChange={set('userGender')}>
                <option>ชาย</option>
                <option>หญิง</option>
                <option>อื่นๆ</option>
              </select>
            </Field>
            <Field label="อายุ">
              <input value={form.userAge} onChange={set('userAge')} />
            </Field>
            <Field label="อาชีพ">
              <input value={form.userJob} onChange={set('userJob')} />
            </Field>
          </div>
          <Field label={`ความสัมพันธ์กับ ${form.name || 'ตัวละคร'}`}>
            <textarea rows={3} value={form.userRole} onChange={set('userRole')} />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="image-step">
          <div className="image-preview" aria-busy={imageState.busy}>
            <img src={avatar} alt="ภาพตัวละคร" />
            {imageState.busy && <div className="image-overlay">{imageState.text}</div>}
          </div>
          <div className="form">
            <Field label="บรรยายหน้าตา" hint="พิมพ์ไทยได้ ระบบจะแปลและวาดเป็นลายเส้นมังฮวา">
              <textarea
                rows={3}
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="เช่น ผมยาวลอนสีน้ำตาล ใส่แว่นกลม ติดโบว์สีชมพู ยิ้มอ่อนโยน"
              />
            </Field>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => generateImage()} disabled={imageState.busy}>
                <Sparkle size={16} /> สร้างภาพ
              </button>
              <button
                type="button"
                className="btn btn-soft"
                disabled={imageState.busy}
                onClick={() => {
                  const theme = pick(IMAGE_THEMES);
                  setImagePrompt(theme);
                  generateImage(theme);
                }}
              >
                <Shuffle size={16} /> สุ่มภาพ
              </button>
            </div>
            {imageState.error && (
              <p className="form-error" role="alert">
                {imageState.error}
              </p>
            )}
            <Field label="หรือวางลิงก์รูป">
              <input
                type="url"
                placeholder="https://…"
                onChange={(e) => e.target.value.startsWith('http') && setAvatar(e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="req"> *</span>}
      </span>
      {children}
      {hint && <span className="help">{hint}</span>}
    </label>
  );
}
