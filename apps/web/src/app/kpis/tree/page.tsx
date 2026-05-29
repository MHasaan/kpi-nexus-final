'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, getAccessToken, getCascadeTree, type CascadeTreeNode } from '../../../lib/api-client';

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
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Cascade tree</span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">KPI Cascade Tree</h1>
        <p className="mt-1 text-sm text-content-muted">Parent KPIs and the children that roll up into them, by BFS level.</p>
        {error && <p className="mt-4 text-sm text-status-critical">{error}</p>}
        <div className="mt-6 space-y-4" data-testid="tree-roots">
          {(tree ?? []).map((node) => (
            <div key={node.parentKpiId} className="rounded-lg border border-border bg-surface-1 p-5" style={{ marginLeft: `${node.level * 1.5}rem` }}>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase text-content-muted">L{node.level}</span>
                <h3 className="font-medium text-content-strong">{node.parentName}</h3>
              </div>
              <ul className="mt-2 space-y-1">
                {node.children.map((c) => (
                  <li key={c.childKpiId} className="flex items-center justify-between border-t border-border py-1.5 text-sm">
                    <span className="text-content-strong">↳ {c.childName}</span>
                    <span className="text-content-muted">{c.method} · weight {c.weight}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {tree && tree.length === 0 && (
            <div className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="tree-empty">
              No cascades yet. Attach children on a KPI&apos;s Cascade tab to build a rollup tree.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
