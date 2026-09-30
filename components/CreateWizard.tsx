'use client';

import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, MagicWand, PencilSimple, Shuffle, Sparkle, Stop, Trash, UploadSimple } from '@phosphor-icons/react';
import Modal from './Modal';
import { BOT_PRESETS, DEFAULT_AVATAR, IMAGE_THEMES, USER_PRESETS, pickNew } from '@/lib/presets';
import { ageNumber } from '@/lib/age';
import { fileToAvatar } from '@/lib/image';
import { generateCharacter } from '@/lib/ollama';
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
  userName: '',
  userGender: 'ชาย',
  userAge: '21 ปี',
  userJob: 'นักศึกษา',
  userRole: 'เพื่อนสนิทสมัยเด็กที่รู้ความลับของกันและกัน',
  adult: false,
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

type Props = {
  host: string;
  model: string;
  onClose: () => void;
  onCreate: (c: Character) => void;
};

export default function CreateWizard({ host, model, onClose, onCreate }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageState, setImageState] = useState<{ busy: boolean; text?: string; error?: string }>({ busy: false });

  // Writing the character by hand is the default; the AI builder only shows when picked.
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [outline, setOutline] = useState('');
  const [aiState, setAiState] = useState<{ busy: boolean; chars?: number; error?: string }>({ busy: false });
  const aiAbort = useRef<AbortController | null>(null);
  // Bumped by every image action so a slow earlier one can't overwrite a newer choice.
  const imageJob = useRef(0);
  const last = useRef<{ bot?: (typeof BOT_PRESETS)[number]; user?: (typeof USER_PRESETS)[number]; theme?: string }>({});

  const set = (key: Exclude<keyof typeof EMPTY, 'adult'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setError(null);
  };

  const randomBot = () => {
    const preset = (last.current.bot = pickNew(BOT_PRESETS, last.current.bot));
    const { imagePrompt: p, ...rest } = preset;
    setForm((f) => ({ ...f, ...rest }));
    setImagePrompt(p);
    setError(null);
  };

  const randomUser = () => {
    const preset = (last.current.user = pickNew(USER_PRESETS, last.current.user));
    setForm((f) => ({ ...f, ...preset }));
    setError(null);
  };

  const aiGenerate = async () => {
    const controller = new AbortController();
    aiAbort.current = controller;
    setAiState({ busy: true, chars: 0 });
    setError(null);
    try {
      const { imagePrompt: p, ...draft } = await generateCharacter(
        { host, model, outline, adult: form.adult, signal: controller.signal },
        (chars) => setAiState({ busy: true, chars }),
      );
      // Adult mode needs an adult character; the model occasionally ignores that.
      if (form.adult && (ageNumber(draft.age) ?? 18) < 18) draft.age = '20 ปี';
      setForm((f) => ({ ...f, ...draft }));
      if (p) setImagePrompt(p);
      setAiState({ busy: false });
    } catch (err) {
      setAiState({
        busy: false,
        error: controller.signal.aborted ? undefined : err instanceof Error ? err.message : 'สร้างตัวละครไม่สำเร็จ',
      });
    } finally {
      aiAbort.current = null;
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const job = ++imageJob.current;
    setImageState({ busy: true, text: 'กำลังย่อรูป…' });
    try {
      const url = await fileToAvatar(file);
      if (job !== imageJob.current) return;
      setAvatar(url);
      setImageState({ busy: false });
    } catch (err) {
      if (job !== imageJob.current) return;
      setImageState({ busy: false, error: err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ' });
    }
  };

  const generateImage = async (prompt = imagePrompt) => {
    if (!prompt.trim()) {
      setImageState({ busy: false, error: 'พิมพ์คำบรรยายภาพก่อน' });
      return;
    }
    const job = ++imageJob.current;
    setImageState({ busy: true, text: 'กำลังแปลคำบรรยาย…' });
    const english = await toEnglish(prompt.trim());
    if (job !== imageJob.current) return;
    setImageState({ busy: true, text: 'กำลังวาดภาพ อาจใช้เวลาสักครู่…' });
    const seed = Math.floor(Math.random() * 100000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(`${english}, ${STYLE_TAGS}`)}?width=600&height=800&nologo=true&seed=${seed}`;
    const img = new Image();
    img.onload = () => {
      if (job !== imageJob.current) return;
      setAvatar(url);
      setImageState({ busy: false });
    };
    img.onerror = () => {
      if (job !== imageJob.current) return;
      setImageState({ busy: false, error: 'โหลดภาพไม่สำเร็จ ลองกดสร้างภาพอีกครั้ง' });
    };
    img.src = url;
  };

  const removeImage = () => {
    imageJob.current++;
    setAvatar(DEFAULT_AVATAR);
    setImageState({ busy: false });
  };

  const next = () => {
    if (step === 0 && !form.name.trim()) return setError('ใส่ชื่อตัวละครก่อนไปขั้นถัดไป');
    if (step === 0 && form.adult && (ageNumber(form.age) ?? 18) < 18) return setError('โหมด 18+ ตัวละครต้องอายุ 18 ปีขึ้นไป');
    if (step === 1 && form.adult && (ageNumber(form.userAge) ?? 18) < 18) return setError('โหมด 18+ ตัวคุณต้องอายุ 18 ปีขึ้นไป');
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
      adult: form.adult,
      avatar,
      messages: [{ sender: 'char', text: firstMessage }],
      updatedAt: Date.now(),
    });
  };

  return (
    <Modal
      title="สร้างตัวละคร"
      wide
      onClose={() => {
        aiAbort.current?.abort();
        onClose();
      }}
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
          <button className="btn btn-primary push" onClick={next} disabled={imageState.busy || aiState.busy}>
            {step === 2 ? 'เริ่มคุย' : 'ถัดไป'} {step < 2 && <ArrowRight size={16} />}
          </button>
        </>
      }
    >
      {step === 0 && (
        <div className="form">
          <div className="mode-pick" role="radiogroup" aria-label="วิธีสร้างตัวละคร">
            <button type="button" role="radio" aria-checked={mode === 'manual'} disabled={aiState.busy} onClick={() => setMode('manual')}>
              <PencilSimple size={18} />
              <span>
                <span className="toggle-title">สร้างเอง</span>
                <span className="help">กรอกรายละเอียดตัวละครด้วยตัวเอง</span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={mode === 'ai'} onClick={() => setMode('ai')}>
              <MagicWand size={18} />
              <span>
                <span className="toggle-title">ให้ AI ช่วยคิด</span>
                <span className="help">AI เขียนให้ แล้วแก้ต่อได้</span>
              </span>
            </button>
          </div>

          {mode === 'ai' && (
            <div className="ai-box">
              <Field label="มีโครงเรื่องคร่าวๆ ไหม? ให้ AI คิดต่อให้" hint="เว้นว่างไว้ ให้ AI คิดเองทั้งหมดก็ได้ ผลลัพธ์จะลงช่องด้านล่าง แก้ต่อได้">
                <textarea
                  rows={2}
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder="เช่น หัวหน้าแก๊งมาเฟียที่ต้องแกล้งเป็นแฟนเรา / นางเงือกที่ขึ้นบกมาตามหาคนช่วยชีวิต"
                  disabled={aiState.busy}
                />
              </Field>
              <div className="row">
                {aiState.busy ? (
                  <>
                    <button type="button" className="btn btn-soft" onClick={() => aiAbort.current?.abort()}>
                      <Stop size={16} weight="fill" /> หยุด
                    </button>
                    <span className="help ai-progress">AI กำลังคิดเนื้อเรื่อง… {aiState.chars ? `${aiState.chars} ตัวอักษร` : ''}</span>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={aiGenerate}>
                    <MagicWand size={16} /> ให้ AI สร้างตัวละคร
                  </button>
                )}
              </div>
              {aiState.error && (
                <p className="form-error" role="alert">
                  {aiState.error}
                </p>
              )}
            </div>
          )}

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
          <label className="toggle">
            <input
              type="checkbox"
              checked={form.adult}
              onChange={(e) => {
                setForm((f) => ({ ...f, adult: e.target.checked }));
                setError(null);
              }}
            />
            <span>
              <span className="toggle-title">โหมดหยาบ 18+</span>
              <span className="help">ตัวละครจะพูด กู/มึง ด่าและสบถใส่คุณ เล่นเนื้อหาผู้ใหญ่ได้ ถ้าไม่ติ๊กจะคุยสุภาพตามบท (เปิด/ปิดทีหลังในห้องแชทได้)</span>
            </span>
          </label>
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
            <input value={form.userName} onChange={set('userName')} placeholder="เช่น เรย์" aria-invalid={!!error && !form.userName} />
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
                  const theme = (last.current.theme = pickNew(IMAGE_THEMES, last.current.theme));
                  setImagePrompt(theme);
                  generateImage(theme);
                }}
              >
                <Shuffle size={16} /> สุ่มภาพ
              </button>
              <label className="btn btn-soft" aria-disabled={imageState.busy}>
                <UploadSimple size={16} /> อัปโหลดรูป
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={imageState.busy}
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {(avatar !== DEFAULT_AVATAR || imageState.busy) && (
                <button type="button" className="btn btn-ghost" onClick={removeImage}>
                  <Trash size={16} /> {imageState.busy ? 'ยกเลิก' : 'ลบรูป'}
                </button>
              )}
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
                onChange={(e) => {
                  if (!e.target.value.startsWith('http')) return;
                  imageJob.current++;
                  setAvatar(e.target.value);
                  setImageState({ busy: false });
                }}
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
