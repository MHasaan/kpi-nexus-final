import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  /** Optional lucide icon rendered above the title. */
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Optional call-to-action (e.g. a Button). */
  action?: ReactNode;
  className?: string;
}

/** Centered placeholder for empty/zero-result states. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="kn-aura kn-aura-soft flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand-soft text-accent-primary">
          <Icon aria-hidden className="h-6 w-6" />
        </span>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold text-content-strong">{title}</h3>
        {description && <p className="max-w-sm text-sm text-content-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
