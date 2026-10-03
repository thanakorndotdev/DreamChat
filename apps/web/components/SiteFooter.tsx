import Link from 'next/link';
import Copyright from '@longrak/shared/components/Copyright';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <Copyright />
      <nav aria-label="ลิงก์ท้ายหน้า">
        <Link href="/">หน้าแรก</Link>
        <Link href="/membership">แพ็กเกจ</Link>
        <Link href="/privacy">ความเป็นส่วนตัว</Link>
        <Link href="/terms">ข้อกำหนดการใช้งาน</Link>
      </nav>
    </footer>
  );
}
