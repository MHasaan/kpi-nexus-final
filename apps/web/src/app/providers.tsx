'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { LocaleProvider } from '../i18n/locale-provider';
import { TerminologyProvider } from '../lib/terminology-context';
import { ConfirmProvider } from '../lib/use-confirm';
import { ToastProvider } from '../lib/use-toast';

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
        <TerminologyProvider>
          {/* One toast stack and one confirm dialog for every page (X-01). */}
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </TerminologyProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
