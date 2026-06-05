'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '../../lib/cn';

const TABS = [
  { href: '/kpis', label: 'Catalog' },
  { href: '/kpis/categories', label: 'Categories' },
  { href: '/kpis/templates', label: 'Templates' },
  { href: '/kpis/tree', label: 'Tree' },
  { href: '/kpis/scorecard', label: 'Scorecard' },
  { href: '/kpis/import', label: 'Import' },
  { href: '/kpis/archive', label: 'Archive' },
] as const;

export function KpiSubnav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="KPI sections"
      className="flex flex-wrap items-center gap-1 border-b border-border-divider"
      data-testid="kpi-subnav"
    >
      {TABS.map((t) => {
        const active = t.href === '/kpis' ? pathname === '/kpis' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            data-testid={`kpi-subnav-${t.label.toLowerCase()}`}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-content-muted hover:text-content',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
