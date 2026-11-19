import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';
import { Providers } from './providers';

// Self-hosted via next/font; exposes the CSS vars the design tokens reference
// (--font-inter / --font-jetbrains-mono). Both are variable fonts, so no
// `weight` is passed.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'KPI Nexus',
  description: 'Measure what matters.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-surface-bg font-sans antialiased text-content-default">
        {/* a11y: skip-to-content link, visible on keyboard focus */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-accent-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <Providers>
          {/* No id here: the skip link's target is the signed-in shell's own <main>.
              This wrapper used to carry the same id, so the link landed before the menu. */}
          <div>{children}</div>
        </Providers>
      </body>
    </html>
  );
}
