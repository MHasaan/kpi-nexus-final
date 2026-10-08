'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, getAccessToken, getCascadeTree, type CascadeTreeNode } from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { KpiSubnav } from '../../../components/kpis/kpi-subnav';
import { Badge, Card, EmptyState, Skeleton } from '../../../components/ui';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

export default function CascadeTreePage() {
  const router = useRouter();
  const [tree, setTree] = useState<CascadeTreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
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
            <div
              key={node.parentKpiId}
              style={{ marginLeft: `${node.level * 1.5}rem` }}
              className={
                node.level > 0
                  ? 'border-l-2 border-border-strong pl-4'
                  : undefined
              }
            >
              <Card>
                <div className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">L{node.level}</Badge>
                      <Link
                        href={`/kpis/${node.parentKpiId}`}
                        className="font-semibold text-content-strong hover:text-accent-primary"
                      >
                        {node.parentName}
                      </Link>
                    </div>
                    <Link
                      href={`/kpis/${node.parentKpiId}`}
                      className="text-xs font-medium text-accent-primary hover:underline"
                      data-testid={`tree-edit-cascades-${node.parentKpiId}`}
                    >
                      Edit cascades →
                    </Link>
                  </div>
                  {/* Children, visually nested under the parent with a vertical guide line. */}
                  <ul className="mt-3 space-y-0 border-l border-border-divider pl-4">
                    {node.children.map((c) => (
                      <li
                        key={c.childKpiId}
                        className="relative flex items-center justify-between py-1.5 text-sm"
                      >
                        {/* Connector tick joining the child row to the vertical guide. */}
                        <span
                          aria-hidden
                          className="absolute -left-4 top-1/2 h-px w-3 bg-border-divider"
                        />
                        <Link
                          href={`/kpis/${c.childKpiId}`}
                          className="text-content-strong hover:text-accent-primary"
                        >
                          {c.childName}
                        </Link>
                        <span className="tabular-nums text-content-muted">
                          {c.method} · weight {c.weight}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </div>
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
