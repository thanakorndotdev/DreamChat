'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';
import CatalogPanel from '@/components/admin/CatalogPanel';
import CouponsPanel from '@/components/admin/CouponsPanel';
import PlansPanel from '@/components/admin/PlansPanel';
import SettingsPanel from '@/components/admin/SettingsPanel';
import UsersPanel from '@/components/admin/UsersPanel';
import { useToast } from '@/components/Toast';

type Tab = 'users' | 'catalog' | 'plans' | 'coupons' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'users', label: 'ผู้ใช้' },
  { id: 'catalog', label: 'คลังตัวละคร' },
  { id: 'plans', label: 'แพ็กเกจ' },
  { id: 'coupons', label: 'โค้ดส่วนลด' },
  { id: 'settings', label: 'ตั้งค่าระบบ' },
];

export default function AdminPage() {
  const [me, setMe] = useState<{ username: string | null; isAdmin: boolean } | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('users');
  const { toast, Toast } = useToast();

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d: { username: string | null; isAdmin?: boolean }) => setMe({ username: d.username, isAdmin: !!d.isAdmin }))
      .catch(() => setMe({ username: null, isAdmin: false }));
  }, []);

  if (me === undefined) return null;
  if (!me.isAdmin) {
    return (
      <main className="admin-denied">
        <p className="empty-title">หน้านี้สำหรับผู้ดูแลระบบ</p>
        <p>{me.username ? `บัญชี ${me.username} ไม่มีสิทธิ์แอดมิน` : 'เข้าสู่ระบบด้วยบัญชีแอดมินก่อน'}</p>
        <Link className="btn btn-primary" href="/">
          กลับหน้าแรก
        </Link>
      </main>
    );
  }

  return (
    <div className="admin">
      <header className="topbar">
        <Link className="icon-btn" href="/" aria-label="กลับหน้าแรก">
          <ArrowLeft size={20} />
        </Link>
        <div className="brand">
          <span className="brand-mark">หลงรักแชท</span>
          <span className="admin-badge">แอดมิน</span>
        </div>
        <span className="admin-me">{me.username}</span>
      </header>

      <main className="admin-main">
        <div className="tabs admin-tabs" role="tablist" aria-label="ส่วนของหน้าแอดมิน">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'users' && <UsersPanel toast={toast} />}
        {tab === 'catalog' && <CatalogPanel toast={toast} />}
        {tab === 'plans' && <PlansPanel toast={toast} />}
        {tab === 'coupons' && <CouponsPanel toast={toast} />}
        {tab === 'settings' && <SettingsPanel toast={toast} />}
      </main>
      <Toast />
    </div>
  );
}
