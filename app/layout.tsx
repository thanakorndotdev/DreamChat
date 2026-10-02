import type { Metadata, Viewport } from 'next';
import { Mitr } from 'next/font/google';
import './globals.css';

/** One family for the whole site: Mitr for both headings (--font-serif) and UI text (--font-sans). */
const mitr = Mitr({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-mitr',
});

export const metadata: Metadata = {
  title: 'หลงรักแชท',
  description: 'เขียนเรื่องรักกับตัวละครที่คุณสร้าง แล้วอ่านต่อได้ทุกตอน ประมวลผลด้วย AI',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={mitr.variable}>
      <body>{children}</body>
    </html>
  );
}
