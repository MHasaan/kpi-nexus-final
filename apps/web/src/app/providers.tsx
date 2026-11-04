'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { LocaleProvider } from '../i18n/locale-provider';
import { TerminologyProvider } from '../lib/terminology-context';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <LocaleProvider>
        {/* App-wide, so the shell's nav and every page share the org's labels (FE-007). */}
        <TerminologyProvider>{children}</TerminologyProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
