'use client';

import { useEffect, useState } from 'react';
import { ArrowSquareOut, List, SignOut, X } from '@phosphor-icons/react';
import CatalogPanel from '@/components/CatalogPanel';
import CouponsPanel from '@/components/CouponsPanel';
import EvidencePanel from '@/components/EvidencePanel';
import LegalPanel from '@/components/LegalPanel';
import PlansPanel from '@/components/PlansPanel';
import ReportsPanel from '@/components/ReportsPanel';
import SecurityPanel from '@/components/SecurityPanel';
import SettingsPanel from '@/components/SettingsPanel';
import StatsPanel from '@/components/StatsPanel';
import TokensPanel from '@/components/TokensPanel';
import UsersPanel from '@/components/UsersPanel';
import { WEB_URL } from '@/components/api';
import Copyright from '@longrak/shared/components/Copyright';
import { useToast } from '@longrak/shared/components/Toast';


type Tab = 'overview' | 'users' | 'evidence' | 'catalog' | 'reports' | 'plans' | 'tokens' | 'coupons' | 'legal' | 'security' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'users', label: 'ผู้ใช้' },
  { id: 'evidence', label: 'หลักฐาน' },
  { id: 'catalog', label: 'คลังตัวละคร' },
  { id: 'reports', label: 'แจ้งปัญหา' },
  { id: 'plans', label: 'แพ็กเกจ' },
  { id: 'tokens', label: 'โทเคน' },
  { id: 'coupons', label: 'โค้ดส่วนลด' },
  { id: 'legal', label: 'นโยบาย' },
  { id: 'security', label: 'ความปลอดภัย' },
  { id: 'settings', label: 'ตั้งค่าระบบ' },
];

export default function AdminPage() {
  const [me, setMe] = useState<{ username: string | null; isAdmin: boolean } | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast, Toast } = useToast();

  const loadMe = () =>
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { username: string | null; isAdmin?: boolean }) => setMe({ username: d.username, isAdmin: !!d.isAdmin }))
      .catch(() => setMe({ username: null, isAdmin: false }));

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    document.querySelector<HTMLElement>('.admin-drawer [aria-current="page"]')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setMe({ username: null, isAdmin: false });
  };

  if (me === undefined) return null;
  if (!me.isAdmin) return <AdminLogin signedInAs={me.username} onSignedIn={loadMe} onLogout={logout} />;

  return (
    <div className="admin">
      <header className="topbar">
        <button className="btn btn-ghost admin-menu-btn" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="admin-menu">
          <List size={20} weight="bold" />
          <span>เมนู</span>
        </button>
        <div className="brand">
          <span className="brand-mark">หลงรักแชท</span>
          <span className="admin-badge">แอดมิน</span>
        </div>
        <span className="admin-section">{TABS.find((t) => t.id === tab)?.label}</span>
        {WEB_URL && (
          <a className="icon-btn" href={WEB_URL} aria-label="ไปหน้าเว็บไซต์" title="ไปหน้าเว็บไซต์">
            <ArrowSquareOut size={20} />
          </a>
        )}
      </header>

      {menuOpen && <div className="admin-drawer-scrim" onClick={() => setMenuOpen(false)} />}
      <nav id="admin-menu" className="admin-drawer" data-open={menuOpen || undefined} aria-label="ส่วนของหน้าแอดมิน" inert={!menuOpen}>
        <div className="admin-drawer-head">
          <span className="admin-me">{me.username}</span>
          <button className="icon-btn" onClick={() => setMenuOpen(false)} aria-label="ปิดเมนู">
            <X size={18} weight="bold" />
          </button>
        </div>
        <ul>
          {TABS.map((t) => (
            <li key={t.id}>
              <button
                aria-current={tab === t.id ? 'page' : undefined}
                onClick={() => {
                  setTab(t.id);
                  setMenuOpen(false);
                  window.scrollTo({ top: 0 });
                }}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-ghost admin-drawer-logout" onClick={logout}>
          <SignOut size={18} />
          <span>ออกจากระบบ</span>
        </button>
      </nav>

      <main className="admin-main">

        {tab === 'overview' && <StatsPanel toast={toast} />}
        {tab === 'users' && <UsersPanel toast={toast} />}
        {tab === 'evidence' && <EvidencePanel toast={toast} />}
        {tab === 'catalog' && <CatalogPanel toast={toast} />}
        {tab === 'reports' && <ReportsPanel toast={toast} />}
        {tab === 'plans' && <PlansPanel toast={toast} />}
        {tab === 'tokens' && <TokensPanel toast={toast} />}
        {tab === 'coupons' && <CouponsPanel toast={toast} />}
        {tab === 'legal' && <LegalPanel toast={toast} />}
        {tab === 'security' && <SecurityPanel toast={toast} />}
        {tab === 'settings' && <SettingsPanel toast={toast} />}
      </main>
      <footer className="site-footer">
        <Copyright />
      </footer>
      <Toast />
    </div>
  );
}

/** The console's own sign-in; it keeps its own session, separate from the public site's. */
function AdminLogin({ signedInAs, onSignedIn, onLogout }: { signedInAs: string | null; onSignedIn: () => void; onLogout: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) throw new Error((await res.text()) || 'เข้าสู่ระบบไม่สำเร็จ');
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <p className="brand-mark">หลงรักแชท</p>
        <p className="auth-lead">
          {signedInAs ? `บัญชี ${signedInAs} ไม่มีสิทธิ์แอดมิน เข้าสู่ระบบด้วยบัญชีแอดมิน` : 'ระบบผู้ดูแล เข้าสู่ระบบด้วยบัญชีแอดมิน'}
        </p>
        <label className="field">
          <span className="field-label">ชื่อผู้ใช้</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        </label>
        <label className="field">
          <span className="field-label">รหัสผ่าน</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !username || !password}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
        {signedInAs && (
          <button type="button" className="link consent-logout" onClick={onLogout}>
            ออกจากระบบ {signedInAs}
          </button>
        )}
      </form>
    </main>
  );
}
