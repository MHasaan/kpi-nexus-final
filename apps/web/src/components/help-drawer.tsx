'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { helpForPath } from '../lib/contextual-help';

const SEEN_KEY = 'kpi-nexus.help-drawer-seen';

/**
 * Floating contextual-help drawer.
 *
 * - A "?" button fixed to the bottom-right corner opens a slide-out panel.
 * - The button pulses until the user opens the drawer for the first time.
 * - The "seen" state is persisted in localStorage so the pulse never returns.
 * - The panel displays tips relevant to the current route via helpForPath().
 * - Pressing Escape closes the drawer.
 * - Accessible: button has aria-label="Help"; panel has role="dialog".
 */
export function HelpDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true); // start as seen to avoid SSR mismatch
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // After mount: read the real persisted value.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const value = window.localStorage.getItem(SEEN_KEY);
    setSeen(value === '1');
  }, []);

  // Mark as seen the first time the user opens the drawer.
  const openDrawer = () => {
    setOpen(true);
    if (!seen) {
      setSeen(true);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SEEN_KEY, '1');
      }
    }
  };

  const closeDrawer = () => setOpen(false);

  // Esc key closes the drawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Move focus to the close button when the drawer opens.
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus();
    }
  }, [open]);

  const help = helpForPath(pathname ?? '');

  return (
    <>
      {/* Floating "?" button */}
      <button
        type="button"
        aria-label="Help"
        data-testid="help-drawer-trigger"
        onClick={openDrawer}
        className={[
          'fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center',
          'rounded-full border border-border bg-surface-1 text-sm font-semibold',
          'text-content-default shadow-md transition hover:bg-surface-2 hover:text-accent-primary',
          // Pulse animation while unseen; removed once the user has opened once.
          !seen ? 'animate-pulse ring-2 ring-accent-primary ring-offset-2' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        ?
      </button>

      {/* Backdrop — clicking outside closes the drawer */}
      {open && (
        <div
          data-testid="help-drawer-backdrop"
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/20"
          onClick={closeDrawer}
        />
      )}

      {/* Slide-out drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contextual help"
        data-testid="help-drawer"
        className={[
          'fixed right-0 top-0 z-50 flex h-full w-[320px] flex-col border-l border-border',
          'bg-surface-bg shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2
            className="text-sm font-semibold text-content-strong"
            data-testid="help-drawer-title"
          >
            {help.title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close help drawer"
            data-testid="help-drawer-close"
            onClick={closeDrawer}
            className="text-lg leading-none text-content-muted hover:text-content-strong"
          >
            ×
          </button>
        </div>

        {/* Tips list */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <ul
            className="space-y-3"
            data-testid="help-drawer-tips"
            aria-label="Tips"
          >
            {help.tips.map((tip, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-content-default"
                data-testid={`help-tip-${i}`}
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex-shrink-0 text-accent-primary"
                >
                  •
                </span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-content-muted">
            Tips update as you navigate. Press{' '}
            <kbd className="rounded border border-border bg-surface-2 px-1 py-0.5 font-mono text-[10px]">
              Esc
            </kbd>{' '}
            to close.
          </p>
        </div>
      </div>
    </>
  );
}
