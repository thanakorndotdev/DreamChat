import type { Metadata, Viewport } from 'next';
import { Chonburi, Mitr } from 'next/font/google';
import '@longrak/shared/styles/globals.css';
import './site.css';

/** Mitr for reading and chatting: soft and light-novel romantic. */
const mitr = Mitr({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-mitr',
});

/** Chonburi only for character names and headings (--display in globals.css). It comes in one weight. */
const chonburi = Chonburi({
  subsets: ['thai', 'latin'],
  weight: '400',
  variable: '--font-chonburi',
});

export const metadata: Metadata = {
  title: 'หลงรักแชท',
  description: 'เขียนเรื่องรักกับตัวละครที่คุณสร้าง แล้วอ่านต่อได้ทุกตอน ประมวลผลด้วย AI',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcf9f5' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1418' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${mitr.variable} ${chonburi.variable}`}>
      <body>{children}</body>
    </html>
  );
}
