import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong placeholder:text-content-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-accent-primary disabled:opacity-50 disabled:pointer-events-none aria-[invalid=true]:border-status-critical aria-[invalid=true]:ring-status-critical',
        className,
      )}
      {...rest}
    />
  );
});
