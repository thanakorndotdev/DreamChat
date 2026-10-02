'use client';

import { useMemo, useState } from 'react';
import { BookOpen, Bug, ChatCircle, Crown, LockSimple, MagnifyingGlass, Megaphone, Plus, Trash, UserCircle } from '@phosphor-icons/react';
import Link from 'next/link';
import RoleplayText from './RoleplayText';
import { STATUS_LABEL } from '@longrak/shared/catalog';
import { type Plan, TIER_LABEL } from '@longrak/shared/plans';
import type { CatalogCard, Submission } from '@/lib/store';
import type { Character } from '@longrak/shared/types';
import SiteFooter from './SiteFooter';

type Props = {
  characters: Character[];
  ready: boolean;
  username: string;
  /** Not signed in: only the catalog shows, and anything that needs an account asks to sign in. */
  guest: boolean;
  onLogin: () => void;
  catalog: CatalogCard[];
  submissions: Submission[];
  plan: Plan | null;
  onOpen: (id: string) => void;
  /** Starts (or continues) a chat with a catalog character. */
  onStart: (catalogId: string) => void;
  onSubmitForPublish: (characterId: string) => void;
  onWithdraw: (characterId: string) => void;
  onReport: () => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onAccount: () => void;
  /** Old chats found in this browser from before accounts. */
  legacyCount: number;
  onImportLegacy: () => void;
  onDiscardLegacy: () => void;
};

type Shelf = 'all' | 'general' | 'adult';
type Sort = 'recent' | 'longest' | 'name';

const SHELVES: { id: Shelf; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'general', label: 'ทั่วไป' },
  { id: 'adult', label: '18+' },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'อ่านล่าสุด' },
  { id: 'longest', label: 'คุยยาวที่สุด' },
  { id: 'name', label: 'ชื่อ ก–ฮ' },
];

const relative = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });

function ago(ts: number) {
  const minutes = Math.round((ts - Date.now()) / 60000);
  if (minutes > -1) return 'เมื่อสักครู่';
  if (minutes > -60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days > -30) return relative.format(days, 'day');
  return new Date(ts).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function lastLine(c: Character) {
  const visible = c.messages.filter((m) => !m.failed);
  return visible.length ? visible[visible.length - 1].text : c.firstMessage;
}

function lineCount(c: Character) {
  return c.messages.filter((m) => !m.failed).length;
}

/** Each story note closes a stretch of the chat, so the next stretch is the episode being written now. */
function episode(c: Character) {
  return (c.notes?.length ?? 0) + 1;
}

export default function Lobby({
  characters,
  ready,
  username,
  guest,
  onLogin,
  catalog,
  submissions,
  plan,
  onOpen,
  onStart,
  onSubmitForPublish,
  onWithdraw,
  onReport,
  onDelete,
  onCreate,
  onAccount,
  legacyCount,
  onImportLegacy,
  onDiscardLegacy,
}: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [publishId, setPublishId] = useState<string | null>(null);
  const level = plan?.level ?? 0;
  const submissionOf = (c: Character) => (c.sourceId ? undefined : submissions.find((s) => s.sourceId === c.id));
  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState<Shelf>('all');
  const [sort, setSort] = useState<Sort>('recent');

  const byRecent = useMemo(() => [...characters].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [characters]);
  const recent = byRecent[0];
  const mostTalked = useMemo(
    () => [...characters].filter((c) => lineCount(c) > 0).sort((a, b) => lineCount(b) - lineCount(a)).slice(0, 5),
    [characters],
  );

  const books = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = byRecent.filter(
      (c) =>
        (shelf === 'all' || (shelf === 'adult') === !!c.adult) &&
        (!q || [c.name, c.role, c.job, c.userName].some((s) => s?.toLowerCase().includes(q))),
    );
    if (sort === 'longest') list.sort((a, b) => lineCount(b) - lineCount(a));
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
    return list;
  }, [byRecent, query, shelf, sort]);

  const empty = ready && characters.length === 0;

  const shelfCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter(
      (e) =>
        (shelf === 'all' || (shelf === 'adult') === !!e.sheet.adult) &&
        (!q || [e.sheet.name, e.sheet.role, e.sheet.job].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [catalog, query, shelf]);

  return (
    <div className="lobby">
      <header className="topbar" data-signed-in={guest ? undefined : ''}>
        <div className="brand">
          <Link className="brand-mark" href="/">หลงรักแชท</Link>
        </div>
        {(!empty || catalog.length > 0) && (
          <label className="search">
            <MagnifyingGlass size={18} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ บทบาท หรืออาชีพ"
              aria-label="ค้นหาตัวละคร"
            />
          </label>
        )}
        <div className="topbar-actions">
          {guest ? (
            <>
              <Link className="btn btn-ghost btn-collapse" href="/membership" aria-label="แพ็กเกจ">
                <Crown size={17} aria-hidden />
                <span>แพ็กเกจ</span>
              </Link>
              <button className="btn btn-primary" onClick={onLogin}>
                เข้าสู่ระบบ<span className="wide-only"> / สมัคร</span>
              </button>
            </>
          ) : (
          <>
          <Link className="plan-chip" href="/membership" data-level={level} title="แพ็กเกจสมาชิก">
            {level > 0 && <Crown size={14} weight="fill" aria-hidden />}
            {plan?.name ?? 'Free'}
          </Link>
          <button className="icon-btn" onClick={onReport} aria-label="แจ้งปัญหา" title="แจ้งปัญหา">
            <Bug size={19} />
          </button>
          <button className="btn btn-primary btn-collapse" onClick={onCreate} aria-label="สร้างตัวละคร">
            <Plus size={18} weight="bold" />
            <span>สร้างตัวละคร</span>
          </button>
          <button className="btn btn-ghost account" onClick={onAccount} aria-label={`บัญชีของฉัน (${username})`} title="บัญชีของฉัน">
            <span className="account-name">{username}</span>
            <UserCircle size={18} />
          </button>
          </>
          )}
        </div>
      </header>

      <main className="lobby-main">
        {legacyCount > 0 && (
          <div className="legacy-banner" role="status">
            <p>
              เบราว์เซอร์นี้มีแชทเก่า {legacyCount} เรื่องจากก่อนมีระบบบัญชี ถ้าเป็นของคุณ นำเข้าบัญชีนี้ได้ ถ้าเป็นเครื่องที่ใช้ร่วมกันและไม่ใช่ของคุณ กดลบออกจากเครื่อง
            </p>
            <span className="confirm">
              <button className="btn btn-soft" onClick={onImportLegacy}>
                นำเข้าบัญชีนี้
              </button>
              <button className="link danger" onClick={onDiscardLegacy}>
                ลบออกจากเครื่อง
              </button>
            </span>
          </div>
        )}
        {recent && (
          <section className="spread" aria-label="อ่านต่อจากครั้งล่าสุด">
            <button className="spread-cover book" onClick={() => onOpen(recent.id)} aria-label={`อ่านต่อกับ ${recent.name}`}>
              <img src={recent.avatar} alt="" />
            </button>
            <div className="spread-page">
              <p className="spread-episode">อ่านค้างไว้ที่ตอนที่ {episode(recent)}</p>
              <h1 className="spread-title">{recent.name}</h1>
              <p className="spread-meta">
                {recent.role}
                {recent.adult && <span className="badge-adult">18+</span>}
              </p>
              <div className="spread-excerpt">
                <RoleplayText text={lastLine(recent)} />
              </div>
              <div className="spread-foot">
                <button className="btn btn-primary btn-lg" onClick={() => onOpen(recent.id)}>
                  <BookOpen size={20} />
                  อ่านต่อ
                </button>
                <span className="spread-as">คุณเล่นเป็น {recent.userName || 'ผู้เล่น'}</span>
              </div>
            </div>
          </section>
        )}

        {catalog.length > 0 && (
          <section className="catalog" aria-labelledby="catalog-heading">
            <div className="shelf-head">
              <h2 id="catalog-heading" className="section-title">
                คลังตัวละคร <span className="count">{catalog.length} ตัว</span>
              </h2>
              <div className="tabs" role="tablist" aria-label="หมวด">
                {SHELVES.map((s) => (
                  <button key={s.id} role="tab" aria-selected={shelf === s.id} onClick={() => setShelf(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {shelfCatalog.length === 0 ? (
              <p className="shelf-none">ไม่พบตัวละครในคลังที่ตรงกับการค้นหา</p>
            ) : (
              <ul className="books">
                {shelfCatalog.map((e) => {
                  const locked = e.tier > level;
                  const started = characters.some((c) => c.sourceId === e.id);
                  return (
                    <li key={e.id} className="book-item" data-locked={locked || undefined}>
                      <button className="book" onClick={() => onStart(e.id)} aria-label={`${started ? 'อ่านต่อ' : 'เริ่มเรื่องกับ'} ${e.sheet.name}`}>
                        {e.sheet.avatar ? <img src={e.sheet.avatar} alt="" loading="lazy" /> : <span className="admin-noimg" />}
                        {e.tier > 0 && (
                          <span className="tier-badge" data-tier={e.tier}>
                            {locked ? <LockSimple size={12} weight="bold" aria-hidden /> : <Crown size={12} weight="fill" aria-hidden />}
                            {TIER_LABEL[e.tier]}
                          </span>
                        )}
                        {e.sheet.adult && <span className="badge-adult book-badge">18+</span>}
                      </button>
                      <div className="book-info">
                        <h3 className="book-title">
                          <button onClick={() => onStart(e.id)}>{e.sheet.name}</button>
                        </h3>
                        <p className="book-role">{e.sheet.role}</p>
                        <p className="book-line">{e.sheet.userRole ? `คุณคือ ${e.sheet.userRole}` : e.sheet.job}</p>
                        <div className="book-foot">
                          <span className="book-stats">{e.author ? `โดย ${e.author}` : 'จากหลงรักแชท'}</span>
                          <span className="book-cta">{locked ? 'อัปเกรดเพื่อคุย' : started ? 'อ่านต่อ' : 'เริ่มเรื่อง'}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {guest ? (
          catalog.length === 0 && (
            <div className="empty">
              <p className="empty-title">ยินดีต้อนรับสู่หลงรักแชท</p>
              <p>เข้าสู่ระบบเพื่อสร้างตัวละครและเริ่มเขียนเรื่องรักของคุณเอง</p>
              <button className="btn btn-primary btn-lg" onClick={onLogin}>
                เข้าสู่ระบบ / สมัคร
              </button>
            </div>
          )
        ) : empty ? (
          <div className="empty">
            <p className="empty-title">ชั้นหนังสือยังว่างอยู่</p>
            <p>
              {catalog.length
                ? 'เลือกตัวละครจากคลังด้านบนเพื่อเริ่มเรื่องแรก หรือสร้างตัวละครของคุณเอง แชททุกเรื่องเห็นได้เฉพาะคุณ'
                : 'สร้างตัวละครแรก กำหนดนิสัย บทบาทของคุณ และรูปปก แล้วเริ่มเขียนเรื่องด้วยกันได้เลย แชทเห็นได้เฉพาะคุณ'}
            </p>
            <button className="btn btn-primary btn-lg" onClick={onCreate}>
              <Plus size={18} weight="bold" />
              <span>สร้างตัวละคร</span>
            </button>
          </div>
        ) : (
          <div className="library">
            <section className="shelf" aria-labelledby="shelf-heading">
              <div className="shelf-head">
                <h2 id="shelf-heading" className="section-title">
                  ชั้นหนังสือของคุณ{' '}
                <span className="count">
                  {characters.length}
                  {plan?.features.maxCharacters ? `/${plan.features.maxCharacters}` : ''} เรื่อง
                </span>
                </h2>
                <div className="shelf-tools">
                  <div className="tabs" role="tablist" aria-label="หมวด">
                    {SHELVES.map((s) => (
                      <button key={s.id} role="tab" aria-selected={shelf === s.id} onClick={() => setShelf(s.id)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <label className="sort">
                    <span>เรียงตาม</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                      {SORTS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {books.length === 0 ? (
                <p className="shelf-none">
                  ไม่พบเรื่องที่ตรงกับ{query.trim() ? ` “${query.trim()}”` : 'หมวดนี้'}{' '}
                  <button
                    className="link"
                    onClick={() => {
                      setQuery('');
                      setShelf('all');
                    }}
                  >
                    ดูทั้งหมด
                  </button>
                </p>
              ) : (
                <ul className="books">
                  {books.map((c) => (
                    <li key={c.id} className="book-item">
                      <button className="book" onClick={() => onOpen(c.id)} aria-label={`อ่าน ${c.name}`}>
                        <img src={c.avatar} alt="" loading="lazy" />
                        {c.adult && <span className="badge-adult book-badge">18+</span>}
                      </button>
                      <div className="book-info">
                        <h3 className="book-title">
                          <button onClick={() => onOpen(c.id)}>{c.name}</button>
                        </h3>
                        <p className="book-role">{c.role}</p>
                        {submissionOf(c) && (
                          <p className="pub-status" data-status={submissionOf(c)!.status} title={submissionOf(c)!.reviewNote || undefined}>
                            {STATUS_LABEL[submissionOf(c)!.status]}
                            {submissionOf(c)!.status === 'rejected' && submissionOf(c)!.reviewNote && `: ${submissionOf(c)!.reviewNote}`}
                          </p>
                        )}
                        <p className="book-line">
                          <RoleplayText text={lastLine(c)} />
                        </p>
                        {publishId === c.id && (
                          <div className="pub-confirm" role="dialog" aria-label="ส่งเผยแพร่">
                            {submissionOf(c) ? (
                              <>
                                <p>ถอนตัวละครนี้ออกจากคลัง? เรื่องของคุณยังอยู่</p>
                                <span className="confirm">
                                  <button
                                    className="link danger"
                                    onClick={() => {
                                      onWithdraw(c.id);
                                      setPublishId(null);
                                    }}
                                  >
                                    ถอนออก
                                  </button>
                                  <button
                                    className="link"
                                    onClick={() => {
                                      onSubmitForPublish(c.id);
                                      setPublishId(null);
                                    }}
                                  >
                                    ส่งตรวจใหม่
                                  </button>
                                  <button className="link" onClick={() => setPublishId(null)}>
                                    ปิด
                                  </button>
                                </span>
                              </>
                            ) : (
                              <>
                                <p>ส่งข้อมูลตัวละครให้แอดมินตรวจก่อนขึ้นคลัง แชทของคุณจะไม่ถูกส่งไป</p>
                                <span className="confirm">
                                  <button
                                    className="link"
                                    onClick={() => {
                                      onSubmitForPublish(c.id);
                                      setPublishId(null);
                                    }}
                                  >
                                    ส่งตรวจ
                                  </button>
                                  <button className="link" onClick={() => setPublishId(null)}>
                                    ยกเลิก
                                  </button>
                                </span>
                              </>
                            )}
                          </div>
                        )}
                        <div className="book-foot">
                          <span className="book-stats">
                            <span title="จำนวนข้อความ">
                              <ChatCircle size={14} aria-hidden /> {lineCount(c)}
                            </span>
                            <span>ตอนที่ {episode(c)}</span>
                            <span>{ago(c.updatedAt)}</span>
                          </span>
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
                            <span className="book-actions">
                              {!c.sourceId && (
                                <button className="icon-btn" onClick={() => setPublishId(publishId === c.id ? null : c.id)} aria-label={`เผยแพร่ ${c.name}`} title="ส่งเผยแพร่">
                                  <Megaphone size={16} />
                                </button>
                              )}
                              <button className="icon-btn" onClick={() => setConfirmId(c.id)} aria-label={`ลบ ${c.name}`} title="ลบ">
                                <Trash size={16} />
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {mostTalked.length > 1 && (
              <aside className="ranking" aria-labelledby="ranking-heading">
                <h2 id="ranking-heading" className="ranking-title">
                  คุยบ่อยที่สุด
                </h2>
                <ol>
                  {mostTalked.map((c, i) => (
                    <li key={c.id}>
                      <button onClick={() => onOpen(c.id)}>
                        <span className="rank">{i + 1}</span>
                        <img src={c.avatar} alt="" loading="lazy" />
                        <span className="rank-text">
                          <span className="rank-name">{c.name}</span>
                          <span className="rank-meta">{lineCount(c)} ข้อความ</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
