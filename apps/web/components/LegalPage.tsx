import Link from 'next/link';
import SiteFooter from './SiteFooter';

/**
 * Who runs the service, from env so the published pages name the real operator. Read per request
 * (the pages call connection() first), so setting the env on the server is enough; no rebuild.
 */
export function legalInfo() {
  return {
    operator: process.env.LEGAL_OPERATOR_NAME?.trim() || '(ยังไม่ได้ระบุชื่อผู้ให้บริการ)',
    contact: process.env.LEGAL_CONTACT_EMAIL?.trim() || '(ยังไม่ได้ระบุอีเมลติดต่อ)',
  };
}

export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="legal">
      <header className="topbar">
        <Link className="brand-mark" href="/">
          หลงรักแชท
        </Link>
      </header>
      <main className="legal-main">
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">ปรับปรุงล่าสุด {updated}</p>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
