'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

import { LocaleProvider } from '../i18n/locale-provider';
import { BrandingProvider } from '../lib/branding-context';
import { FormatProvider } from '../lib/format-context';
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
          {/* Dates and numbers written the way the organisation's settings say (plan 6.1). */}
          <FormatProvider>
            {/* The organisation's colour, logo, name and favicon (plan 6.3). */}
            <BrandingProvider>
              <ToastProvider>
                <ConfirmProvider>{children}</ConfirmProvider>
              </ToastProvider>
            </BrandingProvider>
          </FormatProvider>
        </TerminologyProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
