'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, ArrowLeft, IdentificationCard, PaperPlaneRight, Stop, Trash } from '@phosphor-icons/react';
import RoleplayText from './RoleplayText';
import StatusDot from './StatusDot';
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

  return (
    <div className="chat" data-profile={profileOpen ? 'open' : undefined}>
      <aside className="profile" aria-label="ข้อมูลตัวละคร">
        <div className="profile-portrait">
          <img src={char.avatar} alt="" />
        </div>
        <div className="profile-body">
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

          <h3 className="profile-h">นิสัยและปูมหลัง</h3>
          <p className="profile-text">{char.personality || '—'}</p>

          <h3 className="profile-h">คุณคือ {char.userName || 'ผู้เล่น'}</h3>
          <p className="profile-text">{char.userRole || 'คนรู้จัก'}</p>
        </div>
      </aside>
      <button className="profile-scrim" aria-label="ปิดข้อมูลตัวละคร" onClick={() => setProfileOpen(false)} />

      <section className="scene">
        <header className="scene-head">
          <button className="icon-btn" onClick={onBack} aria-label="กลับหน้าหลัก">
            <ArrowLeft size={20} />
          </button>
          <button className="scene-who" onClick={() => setProfileOpen((v) => !v)} aria-label="ดูข้อมูลตัวละคร">
            <img src={char.avatar} alt="" />
            <span>
              <span className="scene-name">{char.name}</span>
              <span className="scene-sub">คุณเป็น {char.userName || 'ผู้เล่น'}</span>
            </span>
            <IdentificationCard className="only-mobile" size={18} />
          </button>
          <div className="scene-tools">
            <StatusDot status={status} model={model} />
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
