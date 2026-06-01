import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

const inputBase =
  'h-9 w-full rounded-md border border-border bg-surface-bg px-3 text-sm text-content-strong placeholder:text-content-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-accent-primary disabled:opacity-50 disabled:pointer-events-none aria-[invalid=true]:border-status-critical aria-[invalid=true]:ring-status-critical';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, type = 'text', ...rest }, ref) {
  return <input ref={ref} type={type} className={cn(inputBase, className)} {...rest} />;
});

export { inputBase };
