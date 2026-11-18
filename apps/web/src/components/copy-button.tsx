'use client';

import { useEffect, useRef, useState } from 'react';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Copies `value` to the clipboard and says whether it worked. The plain
 * buttons it replaces gave no sign after a press, and did nothing at all
 * where the browser has no clipboard (an insecure origin).
 */
export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    let next: CopyState = 'copied';
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(value);
    } catch {
      next = 'failed';
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2500);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      data-testid="copy-button"
      aria-live="polite"
      className={className ?? 'rounded-md border border-border bg-surface-1 px-3 py-2 text-xs hover:bg-surface-2'}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select the text to copy it' : label}
    </button>
  );
}
