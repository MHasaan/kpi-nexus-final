import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'KPI Nexus',
  description: 'Measure what matters.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-surface-bg font-sans antialiased text-content-default">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
