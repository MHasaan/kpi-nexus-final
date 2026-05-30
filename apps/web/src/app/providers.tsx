'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { LocaleProvider } from '../i18n/locale-provider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <LocaleProvider>{children}</LocaleProvider>
    </ThemeProvider>
  );
}
