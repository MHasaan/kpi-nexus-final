import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** Renders a required marker after the label text. */
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, children, required, ...rest },
  ref,
) {
  return (
    <label ref={ref} className={cn('text-sm font-medium text-content-strong', className)} {...rest}>
      {children}
      {required && (
        <span aria-hidden className="ml-0.5 text-status-critical">
          *
        </span>
      )}
    </label>
  );
});
