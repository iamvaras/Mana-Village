import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Mana Village Admin', template: '%s · Mana Village Admin' },
  description: 'Village issue management for Panchayat staff.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
