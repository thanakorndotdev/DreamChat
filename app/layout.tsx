import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai, Trirong } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
});

const serif = Trirong({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
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
    <html lang="th" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
