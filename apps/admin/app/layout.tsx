import type { Metadata, Viewport } from 'next';
import { Mitr } from 'next/font/google';
import '@longrak/shared/styles/globals.css';

const mitr = Mitr({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-mitr',
});

export const metadata: Metadata = {
  title: 'หลงรักแชท แอดมิน',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#fcf9f5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={mitr.variable}>
      <body>{children}</body>
    </html>
  );
}
