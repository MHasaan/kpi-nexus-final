'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, getAccessToken, getCascadeTree, type CascadeTreeNode } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { KpiSubnav } from '../../../components/kpis/kpi-subnav';
import { Badge, Card, EmptyState, Skeleton } from '../../../components/ui';

export default function CascadeTreePage() {
  const router = useRouter();
  const [tree, setTree] = useState<CascadeTreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    getCascadeTree()
      .then(setTree)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router]);

  return (
    <RequirePermission permission="KPI_VIEW">
    <AppShell
      title="Cascade tree"
      crumbs={[
        { label: 'Home', href: '/' },
        { label: 'KPIs', href: '/kpis' },
        { label: 'Tree' },
      ]}
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-content-strong">KPI Cascade Tree</h1>
          <p className="text-sm text-content-muted">
            Parent KPIs and the children that roll up into them, by BFS level.
          </p>
        </div>

        <KpiSubnav />

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        {tree === null && !error && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}

        <div className="space-y-4" data-testid="tree-roots">
          {(tree ?? []).map((node) => (
            <Card key={node.parentKpiId} style={{ marginLeft: `${node.level * 1.5}rem` }}>
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">L{node.level}</Badge>
                  <h3 className="font-semibold text-content-strong">{node.parentName}</h3>
                </div>
                <ul className="mt-2 space-y-1">
                  {node.children.map((c) => (
                    <li
                      key={c.childKpiId}
                      className="flex items-center justify-between border-t border-border-divider py-1.5 text-sm"
                    >
                      <Link
                        href={`/kpis/${c.childKpiId}`}
                        className="text-content-strong hover:text-accent-primary"
                      >
                        ↳ {c.childName}
                      </Link>
                      <span className="tabular-nums text-content-muted">
                        {c.method} · weight {c.weight}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
          {tree && tree.length === 0 && (
            <Card>
              <div data-testid="tree-empty">
                <EmptyState
                  title="No cascades yet"
                  description="Attach children on a KPI's Cascade tab to build a rollup tree."
                />
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
    </RequirePermission>
  );
}
