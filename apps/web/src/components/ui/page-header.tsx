import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional eyebrow label rendered above the title (uppercase). */
  eyebrow?: ReactNode;
  /** Right-aligned actions (buttons, menus). */
  actions?: ReactNode;
  className?: string;
  /**
   * `data-testid` applied to the title `<h1>`. Lets pages preserve the e2e
   * heading selectors (e.g. `roles-heading`) that predate the shared header.
   */
  titleTestId?: string;
}

/** Standard page heading: optional eyebrow, title, subtitle, and right-aligned actions. */
export function PageHeader({ title, subtitle, eyebrow, actions, className, titleTestId }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex flex-col gap-1">
        {eyebrow && <span className="kn-eyebrow">{eyebrow}</span>}
        <h1 data-testid={titleTestId} className="text-2xl font-bold tracking-tight text-content-strong">{title}</h1>
        {subtitle && <p className="text-sm text-content-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
