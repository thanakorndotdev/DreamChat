import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Thai, Noto_Serif_Thai } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
});

const serif = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'Dream Chat',
  description: 'สวมบทบาทคุยกับตัวละครที่คุณสร้าง ประมวลผลด้วย Ollama ในเครื่องของคุณ',
};

export const viewport: Viewport = { themeColor: '#17111C' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
