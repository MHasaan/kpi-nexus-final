'use client';

import { cn } from '../cn.js';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  'aria-label'?: string;
  /**
   * When given, each option carries `data-testid="<prefix>-<value>"` — so a
   * test presses the control a person presses, not a hidden stand-in.
   */
  testIdPrefix?: string;
}

/** Segmented control: pill-grouped options, active option raised on surface-1. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
  testIdPrefix,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      // max-w-full + overflow-x-auto: with options kept on one line, a switch too wide for a narrow
      // screen scrolls inside itself instead of pushing the page sideways.
      className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-surface-1 p-1 shadow-inset', className)}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
            onClick={() => onChange(opt.value)}
            className={cn(
              // One line each: squeezed, an option broke into a word a line ("Last / 7 / days").
              'whitespace-nowrap',
              'rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected ? 'bg-surface-bg text-content-strong shadow-xs' : 'text-content-muted hover:text-content-strong',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
