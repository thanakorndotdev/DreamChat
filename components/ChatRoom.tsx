'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, ArrowLeft, Camera, IdentificationCard, Notebook, PaperPlaneRight, Stop, Trash, X } from '@phosphor-icons/react';
import RoleplayText from './RoleplayText';
import { adultBlocker } from '@/lib/age';
import { fileToAvatar } from '@/lib/image';
import { NOTE_EVERY, pendingMessages, writeNote } from '@/lib/memory';
import Link from 'next/link';
import type { BillingState } from '@/app/api/billing/route';
import { LimitError, buildPrompt, streamChat } from '@/lib/ollama';
import type { Character, Message } from '@/lib/types';

type Props = {
  character: Character;
  host: string;
  model: string;
  billing: BillingState | null;
  /** Called after each reply so the daily counter stays current. */
  onReplied: () => void;
  onUpdate: (fn: (c: Character) => Character) => void;
  onBack: () => void;
};

export default function ChatRoom({ character: char, host, model, billing, onReplied, onUpdate, onBack }: Props) {
  const features = billing?.plan.features;
  const memoryOn = (features?.memoryNotes ?? 30) > 0;
  const left = features?.dailyMessages ? Math.max(0, features.dailyMessages - (billing?.usage.chat ?? 0)) : null;
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [tab, setTab] = useState<'profile' | 'notes'>('profile');
  const [noting, setNoting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const notingRef = useRef(false);
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

  // Jot a story note in the background once enough of the chat isn't covered by one yet.
  const jot = async (from: Character) => {
    if (notingRef.current) return;
    notingRef.current = true;
    setNoting(true);
    setNoteError(null);
    try {
      const note = await writeNote({ host, model, char: from });
      if (!note) return;
      onUpdate((c) =>
        // Drop the note if the chat was cleared or another note landed meanwhile.
        (c.notedUpTo ?? 0) !== (from.notedUpTo ?? 0) || c.messages.filter((m) => !m.failed).length < note.upTo
          ? c
          : { ...c, notes: [...(c.notes ?? []), note], notedUpTo: note.upTo },
      );
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'จดบันทึกไม่สำเร็จ');
    } finally {
      notingRef.current = false;
      setNoting(false);
    }
  };

  const pending = pendingMessages(char).length;
  useEffect(() => {
    // Re-checks after each note too, so a long old chat catches up a chunk at a time.
    // A failed note waits for the next message (send clears the error) instead of retrying in a loop.
    if (memoryOn && !busy && !noting && !noteError && pending >= NOTE_EVERY) jot(char);
  }, [pending, busy, noting, noteError, memoryOn]);

  const generate = async (history: Message[]) => {
    const controller = new AbortController();
    abort.current = controller;
    setStreaming('');
    try {
      const reply = await streamChat(
        { host, model, messages: buildPrompt(char, history, features?.memoryNotes), signal: controller.signal },
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
            : { sender: 'char', text: err instanceof Error ? err.message : 'สร้างคำตอบไม่สำเร็จ', failed: true, limited: err instanceof LimitError || undefined },
        ],
      }));
    } finally {
      abort.current = null;
      setStreaming(null);
      onReplied();
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    const history: Message[] = [...char.messages.filter((m) => !m.failed), { sender: 'user', text }];
    onUpdate((c) => ({ ...c, messages: history, updatedAt: Date.now() }));
    setInput('');
    setNoteError(null);
    generate(history);
  };

  const retry = () => {
    const history = char.messages.filter((m) => !m.failed);
    onUpdate((c) => ({ ...c, messages: history }));
    generate(history);
  };

  const clear = () => {
    onUpdate((c) => ({
      ...c,
      messages: [{ sender: 'char', text: c.firstMessage || '*ยืนมองคุณอย่างเงียบสงบ*' }],
      notes: [],
      notedUpTo: 0,
    }));
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
  const blocker = adultBlocker(char);

  return (
    <div className="chat" data-profile={profileOpen ? 'open' : undefined}>
      <aside className="profile" aria-label="ข้อมูลตัวละครและบันทึกเรื่อง">
        <div className="side-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'profile'} onClick={() => setTab('profile')}>
            ตัวละคร
          </button>
          <button role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>
            บันทึกเรื่อง
            {!!char.notes?.length && <span className="tab-count">{char.notes.length}</span>}
            {noting && <span className="tab-pulse" aria-label="กำลังจด" />}
          </button>
        </div>
        {tab === 'notes' ? (
          <StoryNotes
            char={char}
            pending={pending}
            noting={noting}
            error={noteError}
            onJot={() => jot(char)}
            onUpdate={onUpdate}
          />
        ) : (
        <>
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
              checked={!!char.adult && !blocker}
              disabled={!!blocker}
              onChange={(e) => onUpdate((c) => ({ ...c, adult: e.target.checked }))}
            />
            <span>
              <span className="toggle-title">โหมดหยาบ 18+</span>
              <span className={blocker ? 'help warn' : 'help'}>
                {blocker ?? 'ตัวละครจะพูดหยาบใส่คุณตามนิสัย มีผลกับข้อความถัดไป (เปิด/ปิดที่ปุ่ม "หยาบ" บนแถบหัวได้ด้วย)'}
              </span>
            </span>
          </label>
          <div className="grid-2 profile-ages">
            <label className="field">
              <span className="field-label">อายุตัวละคร</span>
              <input value={char.age} onChange={(e) => onUpdate((c) => ({ ...c, age: e.target.value }))} placeholder="เช่น 20 ปี" />
            </label>
            <label className="field">
              <span className="field-label">อายุของคุณ</span>
              <input
                id="player-age"
                value={char.userAge ?? ''}
                onChange={(e) => onUpdate((c) => ({ ...c, userAge: e.target.value }))}
                placeholder="เช่น 21 ปี"
              />
            </label>
          </div>
        </div>
        </>
        )}
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
              setTab('profile');
              setProfileOpen((v) => !v || tab !== 'profile');
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
            <button
              className="icon-btn notes-btn"
              onClick={() => {
                setTab('notes');
                setProfileOpen(true);
              }}
              aria-label="บันทึกเรื่อง"
              title="บันทึกเรื่อง — สิ่งที่ AI จำไว้"
              data-busy={noting ? '' : undefined}
            >
              <Notebook size={19} />
            </button>
            <button
              className="rude-toggle"
              aria-pressed={!!char.adult && !blocker}
              onClick={() => {
                if (!blocker) return onUpdate((c) => ({ ...c, adult: !c.adult }));
                // Explain why instead of silently refusing: open the profile at the age fields.
                setTab('profile');
                setProfileOpen(true);
                requestAnimationFrame(() => document.getElementById('player-age')?.scrollIntoView({ block: 'center' }));
              }}
              title={blocker ?? 'ให้ตัวละครพูดหยาบใส่คุณตามนิสัย (18+)'}
            >
              <span className="rude-track" aria-hidden />
              หยาบ {char.adult && !blocker ? 'เปิด' : 'ปิด'}
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
            <header className="chapter">
              <p className="chapter-num">ตอนที่ {(char.notes?.length ?? 0) + 1}</p>
              <h1 className="chapter-title">{char.name}</h1>
              <p className="chapter-sub">
                {char.role} กับ {char.userName || 'คุณ'}
              </p>
            </header>
            {char.messages.map((m, i) =>
              m.failed ? (
                <div key={i} className="note-error" role="alert">
                  <span>{m.text}</span>
                  {m.limited && (
                    <Link className="link" href="/membership">
                      ดูแพ็กเกจ
                    </Link>
                  )}
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
              <span className="hint">
                {left !== null ? (
                  <Link className="quota" href="/membership" data-low={left <= 5 || undefined}>
                    เหลือ {left} ข้อความวันนี้
                  </Link>
                ) : (
                  'Enter ส่ง · Shift+Enter ขึ้นบรรทัด'
                )}
              </span>
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

type NotesProps = {
  char: Character;
  pending: number;
  noting: boolean;
  error: string | null;
  onJot: () => void;
  onUpdate: (fn: (c: Character) => Character) => void;
};

function StoryNotes({ char, pending, noting, error, onJot, onUpdate }: NotesProps) {
  const notes = char.notes ?? [];
  const roundsLeft = Math.max(1, Math.ceil((NOTE_EVERY - pending) / 2));
  const editNote = (i: number, text: string) =>
    onUpdate((c) => ({ ...c, notes: (c.notes ?? []).map((n, j) => (j === i ? { ...n, text } : n)) }));
  const removeNote = (i: number) => onUpdate((c) => ({ ...c, notes: (c.notes ?? []).filter((_, j) => j !== i) }));

  return (
    <div className="notes">
      <h2 className="notes-title">บันทึกเรื่อง</h2>
      <p className="help">
        AI จะจดเรื่องสำคัญไว้ทุก 5 รอบที่คุยกัน เพื่อให้จำเรื่องราวได้ตลอดทั้งแชท แก้หรือลบได้ มีผลกับข้อความถัดไป
      </p>

      <div className="notes-status">
        {noting ? (
          <span className="thinking">กำลังจดบันทึก</span>
        ) : error ? (
          <span className="help warn" role="alert">
            จดไม่สำเร็จ: {error}
          </span>
        ) : (
          <span className="help">{pending ? `อีกประมาณ ${roundsLeft} รอบจะจดบันทึกถัดไป` : 'จดครบทุกข้อความแล้ว'}</span>
        )}
        <button className="link" onClick={onJot} disabled={noting || pending < 2}>
          {error ? 'ลองอีกครั้ง' : 'จดตอนนี้'}
        </button>
      </div>

      {notes.length ? (
        <ol className="notes-list">
          {notes.map((n, i) => (
            <li key={i} className="note">
              <div className="note-head">
                <span>ตอนที่ {i + 1}</span>
                <button className="icon-btn note-del" onClick={() => removeNote(i)} aria-label={`ลบบันทึกตอนที่ ${i + 1}`}>
                  <X size={14} />
                </button>
              </div>
              <textarea
                className="profile-input profile-textarea note-text"
                value={n.text}
                onChange={(e) => editNote(i, e.target.value)}
                aria-label={`บันทึกตอนที่ ${i + 1}`}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="notes-empty">ยังไม่มีบันทึก คุยกันไปอีกสักพัก แล้ว AI จะเริ่มจดเรื่องราวให้เอง</p>
      )}
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
