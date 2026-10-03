'use client';

import { useMemo, useState } from 'react';
import { ChatCircle, MagnifyingGlass } from '@phosphor-icons/react';
import Modal from '@longrak/shared/components/Modal';
import type { Character } from '@longrak/shared/types';
import { ago, lastLine, lineCount } from '@/lib/chats';

type Props = {
  characters: Character[];
  ready: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
};

/** Every chat on the account, newest first, with where it left off. */
export default function ChatHistory({ characters, ready, onOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...characters].filter((c) => !q || [c.name, c.role, lastLine(c)].some((s) => s?.toLowerCase().includes(q))).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [characters, query]);

  return (
    <Modal title="ประวัติแชท" subtitle={ready ? `${characters.length} เรื่อง เรียงจากล่าสุด` : 'กำลังโหลด…'} onClose={onClose}>
      {characters.length > 0 && (
        <label className="search history-search">
          <MagnifyingGlass size={18} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อหรือข้อความ" aria-label="ค้นหาในประวัติแชท" />
        </label>
      )}
      {ready && characters.length === 0 ? (
        <p className="history-empty">ยังไม่มีแชท เลือกตัวละครจากคลังหรือสร้างตัวละครเพื่อเริ่มเรื่องแรก</p>
      ) : ready && chats.length === 0 ? (
        <p className="history-empty">ไม่พบแชทที่ตรงกับการค้นหา</p>
      ) : (
        <ul className="history-list">
          {chats.map((c) => (
            <li key={c.id}>
              <button className="history-item" onClick={() => onOpen(c.id)}>
                {c.avatar ? <img className="history-avatar" src={c.avatar} alt="" loading="lazy" /> : <span className="history-avatar" aria-hidden />}
                <span className="history-text">
                  <span className="history-top">
                    <span className="history-name">{c.name}</span>
                    {c.adult && <span className="badge-adult">18+</span>}
                    <span className="history-when">{ago(c.updatedAt)}</span>
                  </span>
                  <span className="history-line">{lastLine(c).replace(/\*/g, '')}</span>
                  <span className="history-count">
                    <ChatCircle size={13} aria-hidden /> {lineCount(c).toLocaleString('th-TH')} ข้อความ
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
