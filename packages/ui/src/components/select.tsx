import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../cn.js';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Native select styled to match inputs, with a custom chevron affordance. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...rest }, ref) {
  return (
    // The caller's classes (a width, a margin, a height) size the box the chevron is drawn in, so the chevron
    // stays at the select's own edge: on a narrow select it used to sit at the far edge of the page (F-060).
    <div className={cn('relative inline-flex h-9 w-full', className)}>
      <select
        ref={ref}
        className="h-full w-full appearance-none rounded-md border border-border bg-surface-bg pl-3 pr-9 text-sm text-content-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-accent-primary disabled:opacity-50 disabled:pointer-events-none aria-[invalid=true]:border-status-critical"
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
      />
    </div>
  );
});
