import { forwardRef, type HTMLAttributes, type ElementType } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Semantic element to render as. Defaults to `div`. */
  as?: ElementType;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, children, as: As = 'div', ...rest },
  ref,
) {
  return (
    <As ref={ref} className={cn('bg-surface-bg border border-border rounded-xl shadow-sm', className)} {...rest}>
      {children}
    </As>
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('px-4 py-3.5 border-b border-border-divider flex items-center justify-between gap-3', className)} {...rest}>
      {children}
    </div>
  );
});

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(function CardTitle(
  { className, children, ...rest },
  ref,
) {
  return (
    <h3 ref={ref} className={cn('text-sm font-semibold text-content-strong', className)} {...rest}>
      {children}
    </h3>
  );
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('p-4', className)} {...rest}>
      {children}
    </div>
  );
});

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('px-4 py-3 border-t border-border-divider flex items-center gap-3', className)} {...rest}>
      {children}
    </div>
  );
});
