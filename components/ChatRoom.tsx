'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, ArrowLeft, Camera, IdentificationCard, PaperPlaneRight, Stop, Trash } from '@phosphor-icons/react';
import RoleplayText from './RoleplayText';
import StatusDot from './StatusDot';
import { fileToAvatar } from '@/lib/image';
import { buildPrompt, streamChat } from '@/lib/ollama';
import type { Character, Message, OllamaStatus } from '@/lib/types';

type Props = {
  character: Character;
  host: string;
  model: string;
  status: OllamaStatus;
  onUpdate: (fn: (c: Character) => Character) => void;
  onBack: () => void;
};

export default function ChatRoom({ character: char, host, model, status, onUpdate, onBack }: Props) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = streaming !== null;

  useEffect(() => {
    textarea.current?.focus();
    return () => abort.current?.abort();
  }, [char.id]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [char.messages.length, streaming]);

  const generate = async (history: Message[]) => {
    const controller = new AbortController();
    abort.current = controller;
    setStreaming('');
    try {
      const reply = await streamChat(
        { host, model, messages: buildPrompt(char, history), signal: controller.signal },
        setStreaming,
      );
      onUpdate((c) => ({
        ...c,
        messages: [...c.messages, { sender: 'char', text: reply || '*พยักหน้ารับอย่างเงียบๆ*' }],
        updatedAt: Date.now(),
      }));
    } catch (err) {
      const partial = controller.signal.aborted;
      onUpdate((c) => ({
        ...c,
        messages: [
          ...c.messages,
          partial
            ? { sender: 'char', text: 'หยุดการตอบแล้ว', failed: true }
            : { sender: 'char', text: err instanceof Error ? err.message : 'สร้างคำตอบไม่สำเร็จ', failed: true },
        ],
      }));
    } finally {
      abort.current = null;
      setStreaming(null);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    const history: Message[] = [...char.messages.filter((m) => !m.failed), { sender: 'user', text }];
    onUpdate((c) => ({ ...c, messages: history, updatedAt: Date.now() }));
    setInput('');
    generate(history);
  };

  const retry = () => {
    const history = char.messages.filter((m) => !m.failed);
    onUpdate((c) => ({ ...c, messages: history }));
    generate(history);
  };

  const clear = () => {
    onUpdate((c) => ({ ...c, messages: [{ sender: 'char', text: c.firstMessage || '*ยืนมองคุณอย่างเงียบสงบ*' }] }));
    setConfirmClear(false);
  };

  const insertAction = () => {
    const el = textarea.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = input.slice(s, e);
    setInput(input.slice(0, s) + `*${selected}*` + input.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = selected ? e + 2 : s + 1;
    });
  };

  const lastFailed = char.messages[char.messages.length - 1]?.failed;
  const underage = [char.age, char.userAge].some((a) => Number(a?.match(/\d+/)?.[0] ?? 18) < 18);

  return (
    <div className="chat" data-profile={profileOpen ? 'open' : undefined}>
      <aside className="profile" aria-label="ข้อมูลตัวละคร">
        <div className="profile-portrait">
          <img src={char.avatar} alt="" />
          <label className="portrait-change">
            <Camera size={16} /> เปลี่ยนรูป
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  const avatar = await fileToAvatar(file);
                  onUpdate((c) => ({ ...c, avatar }));
                  setPhotoError(null);
                } catch (err) {
                  setPhotoError(err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ');
                }
              }}
            />
          </label>
        </div>
        <div className="profile-body">
          {photoError && (
            <p className="form-error" role="alert">
              {photoError}
            </p>
          )}
          <h2 className="profile-name">{char.name}</h2>
          <p className="profile-role">{char.role}</p>
          <dl className="facts">
            <div>
              <dt>เพศ</dt>
              <dd>{char.gender || '—'}</dd>
            </div>
            <div>
              <dt>อายุ</dt>
              <dd>{char.age || '—'}</dd>
            </div>
            <div>
              <dt>อาชีพ</dt>
              <dd>{char.job || '—'}</dd>
            </div>
          </dl>

          <label className="profile-h" htmlFor="char-personality">
            นิสัยและปูมหลัง
          </label>
          <textarea
            id="char-personality"
            className="profile-input profile-textarea"
            value={char.personality}
            onChange={(e) => onUpdate((c) => ({ ...c, personality: e.target.value }))}
            placeholder="นิสัย ปูมหลัง และวิธีพูดของตัวละคร"
          />
          <p className="help profile-help">แก้ได้เลย มีผลกับข้อความถัดไป</p>

          <label className="profile-h" htmlFor="player-name">
            คุณคือ
          </label>
          <input
            id="player-name"
            className="profile-input"
            value={char.userName}
            onChange={(e) => onUpdate((c) => ({ ...c, userName: e.target.value }))}
            placeholder="ตั้งชื่อที่ให้ตัวละครเรียกคุณ"
          />
          <p className="profile-text">{char.userRole || 'คนรู้จัก'}</p>

          <label className="toggle">
            <input
              type="checkbox"
              checked={!!char.adult}
              disabled={underage}
              onChange={(e) => onUpdate((c) => ({ ...c, adult: e.target.checked }))}
            />
            <span>
              <span className="toggle-title">โหมดหยาบ 18+</span>
              <span className="help">
                {underage ? 'ตัวละครหรือคุณอายุต่ำกว่า 18 ปี ใช้โหมดนี้ไม่ได้' : 'ตัวละครจะพูด กู/มึง ด่าและสบถใส่คุณ มีผลกับข้อความถัดไป (เปิด/ปิดที่ปุ่ม "หยาบ" บนแถบหัวได้ด้วย)'}
              </span>
            </span>
          </label>
        </div>
      </aside>
      <button className="profile-scrim" aria-label="ปิดข้อมูลตัวละคร" onClick={() => setProfileOpen(false)} />

      <section className="scene">
        <div className="scene-backdrop" aria-hidden="true">
          <img src={char.avatar} alt="" />
        </div>
        <header className="scene-head">
          <button className="icon-btn" onClick={onBack} aria-label="กลับหน้าหลัก">
            <ArrowLeft size={20} />
          </button>
          <button
            className="scene-who"
            onClick={() => {
              setProfileOpen((v) => !v);
              if (!char.userName) requestAnimationFrame(() => document.getElementById('player-name')?.focus());
            }}
            aria-label="ดูข้อมูลตัวละคร"
          >
            <img src={char.avatar} alt="" />
            <span>
              <span className="scene-name">
                {char.name}
                {char.adult && <span className="badge-adult">18+</span>}
              </span>
              <span className="scene-sub">{char.userName ? `คุณเป็น ${char.userName}` : 'แตะเพื่อตั้งชื่อของคุณ'}</span>
            </span>
            <IdentificationCard className="only-mobile" size={18} />
          </button>
          <div className="scene-tools">
            <StatusDot status={status} />
            <button
              className="rude-toggle"
              aria-pressed={!!char.adult}
              disabled={underage}
              onClick={() => onUpdate((c) => ({ ...c, adult: !c.adult }))}
              title={underage ? 'ตัวละครหรือคุณอายุต่ำกว่า 18 ปี ใช้โหมดหยาบไม่ได้' : 'ให้ตัวละครพูดหยาบ ใช้ กู/มึง และคำสบถกับคุณ (18+)'}
            >
              <span className="rude-track" aria-hidden />
              หยาบ {char.adult ? 'เปิด' : 'ปิด'}
            </button>
            {confirmClear ? (
              <span className="confirm">
                <span className="confirm-q">ล้างบทสนทนา?</span>
                <button className="link danger" onClick={clear}>
                  ล้าง
                </button>
                <button className="link" onClick={() => setConfirmClear(false)}>
                  ไม่
                </button>
              </span>
            ) : (
              <button className="icon-btn" onClick={() => setConfirmClear(true)} aria-label="ล้างบทสนทนา" disabled={busy}>
                <Trash size={18} />
              </button>
            )}
          </div>
        </header>

        <div ref={scroller} className="transcript" aria-live="polite">
          <div className="transcript-inner">
            {char.messages.map((m, i) =>
              m.failed ? (
                <div key={i} className="note-error" role="alert">
                  <span>{m.text}</span>
                  {i === char.messages.length - 1 && (
                    <button className="link" onClick={retry} disabled={busy}>
                      <ArrowClockwise size={14} /> ลองอีกครั้ง
                    </button>
                  )}
                </div>
              ) : (
                <Line key={i} message={m} char={char} />
              ),
            )}
            {streaming !== null && (
              <div className="line line-char">
                <p className="speaker">{char.name}</p>
                <div className="prose">
                  {streaming ? <RoleplayText text={streaming} /> : <span className="thinking">กำลังคิดคำตอบ</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="composer-box">
            <textarea
              ref={textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder={lastFailed ? 'ลองอีกครั้ง หรือพิมพ์ข้อความใหม่' : `ตอบ ${char.name}… ใส่ *ท่าทาง* ในเครื่องหมายดอกจัน`}
              aria-label="ข้อความ"
            />
            <div className="composer-bar">
              <button type="button" className="chip" onClick={insertAction}>
                *ท่าทาง*
              </button>
              <span className="hint">Enter ส่ง · Shift+Enter ขึ้นบรรทัด</span>
            </div>
          </div>
          {busy ? (
            <button type="button" className="send" onClick={() => abort.current?.abort()} aria-label="หยุดตอบ">
              <Stop size={22} weight="fill" />
            </button>
          ) : (
            <button type="submit" className="send" disabled={!input.trim()} aria-label="ส่ง">
              <PaperPlaneRight size={22} weight="fill" />
            </button>
          )}
        </form>
      </section>
    </div>
  );
}

function Line({ message, char }: { message: Message; char: Character }) {
  const isUser = message.sender === 'user';
  return (
    <div className={`line ${isUser ? 'line-user' : 'line-char'}`}>
      <p className="speaker">{isUser ? char.userName || 'คุณ' : char.name}</p>
      <div className="prose">
        <RoleplayText text={message.text} />
      </div>
    </div>
  );
}
