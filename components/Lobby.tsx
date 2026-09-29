'use client';

import { useState } from 'react';
import { GearSix, Plus, SignOut, Trash } from '@phosphor-icons/react';
import RoleplayText from './RoleplayText';
import StatusDot from './StatusDot';
import type { Character, OllamaStatus } from '@/lib/types';

type Props = {
  characters: Character[];
  ready: boolean;
  status: OllamaStatus;
  username: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onSettings: () => void;
  onLogout: () => void;
};

function lastLine(c: Character) {
  const visible = c.messages.filter((m) => !m.failed);
  return visible.length ? visible[visible.length - 1].text : c.firstMessage;
}

export default function Lobby({ characters, ready, status, username, onOpen, onDelete, onCreate, onSettings, onLogout }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const recent = [...characters].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

  return (
    <div className="lobby">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Dream Chat</span>
          <span className="brand-sub">โรลเพลย์กับตัวละครของคุณ</span>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={onSettings} aria-label="ตั้งค่า Ollama">
            <StatusDot status={status} />
            <GearSix size={18} />
          </button>
          <button className="btn btn-primary" onClick={onCreate}>
            <Plus size={18} weight="bold" />
            <span>สร้างตัวละคร</span>
          </button>
          <button className="btn btn-ghost account" onClick={onLogout} aria-label={`ออกจากระบบ (${username})`} title="ออกจากระบบ">
            <span className="account-name">{username}</span>
            <SignOut size={18} />
          </button>
        </div>
      </header>

      <main className="lobby-main">
        {recent && (
          <section className="hero" aria-label="เล่นต่อจากครั้งล่าสุด">
            <button className="hero-cover" onClick={() => onOpen(recent.id)} aria-label={`เปิดแชตกับ ${recent.name}`}>
              <img src={recent.avatar} alt="" />
            </button>
            <div className="hero-text">
              <p className="hero-kicker">ค้างไว้ที่ตอนล่าสุดกับ</p>
              <h1 className="hero-name">{recent.name}</h1>
              <p className="hero-meta">{recent.role}</p>
              <p className="hero-meta">คุณเล่นเป็น {recent.userName || 'ผู้เล่น'}</p>
              <blockquote className="hero-excerpt">
                <RoleplayText text={lastLine(recent)} />
              </blockquote>
              <button className="btn btn-primary btn-lg" onClick={() => onOpen(recent.id)}>
                เล่นต่อ
              </button>
            </div>
          </section>
        )}

        <section aria-labelledby="cast-heading">
          <div className="section-head">
            <h2 id="cast-heading" className="section-title">
              ตัวละครของคุณ
            </h2>
            <span className="count">{characters.length}</span>
          </div>

          {ready && characters.length === 0 ? (
            <div className="empty">
              <p className="empty-title">ยังไม่มีตัวละคร</p>
              <p>สร้างตัวละครแรก กำหนดนิสัย บทบาทของคุณ และรูปภาพ แล้วเริ่มคุยได้เลย</p>
              <button className="btn btn-primary" onClick={onCreate}>
                <Plus size={18} weight="bold" />
                <span>สร้างตัวละคร</span>
              </button>
            </div>
          ) : (
            <ul className="cast">
              {characters.map((c) => (
                <li key={c.id} className="cast-item">
                  <button className="cover" onClick={() => onOpen(c.id)} aria-label={`เปิดแชตกับ ${c.name}`}>
                    <img src={c.avatar} alt="" loading="lazy" />
                    <span className="cover-shade" />
                    {c.adult && <span className="badge-adult cover-badge">18+</span>}
                    <span className="cover-title">
                      <span className="cover-name">{c.name}</span>
                      <span className="cover-role">{c.role}</span>
                    </span>
                  </button>
                  <p className="cast-line">
                    <RoleplayText text={lastLine(c)} />
                  </p>
                  <div className="cast-foot">
                    <span className="cast-as">คุณเป็น {c.userName || 'ผู้เล่น'}</span>
                    {confirmId === c.id ? (
                      <span className="confirm">
                        <button className="link danger" onClick={() => onDelete(c.id)}>
                          ลบเลย
                        </button>
                        <button className="link" onClick={() => setConfirmId(null)}>
                          ไม่ลบ
                        </button>
                      </span>
                    ) : (
                      <button className="icon-btn" onClick={() => setConfirmId(c.id)} aria-label={`ลบ ${c.name}`}>
                        <Trash size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
