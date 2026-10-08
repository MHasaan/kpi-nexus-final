'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import {
  type RetentionPolicyRow,
  applyRetentionTier,
  listRetention,
  listRetentionTiers,
} from '../../../lib/polish-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { RequirePermission } from '../../../components/auth/require-permission';

export default function RetentionSettingsPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<RetentionPolicyRow[]>([]);
  const [tiers, setTiers] = useState<Array<{ tier: string; days: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([listRetention(), listRetentionTiers()]);
      setPolicies(p);
      setTiers(t);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load retention');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void load();
  }, [load, router]);

  const apply = async (tier: string) => {
    try {
      await applyRetentionTier(tier);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Apply failed');
    }
  };

  // FE-014: same permission the page's API enforces — no broken 403 screens.
  return (
    <RequirePermission permission="ORG_SETTINGS">
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/settings" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Data retention</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Data retention</h1>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="retention-error">{error}</p>}

        <div className="mt-5 grid gap-4 sm:grid-cols-3" data-testid="retention-tiers">
          {tiers.map((t) => (
            <div key={t.tier} data-testid={`tier-${t.tier}`} className="rounded-lg border border-border bg-surface-1 p-5 text-center">
              <h2 className="font-semibold text-content-strong">{t.tier}</h2>
              <p className="mt-1 text-sm text-content-muted">{t.days} days</p>
              <button type="button" data-testid={`apply-tier-${t.tier}`} onClick={() => apply(t.tier)} className="mt-3 rounded bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Apply</button>
            </div>
          ))}
        </div>

        <h2 className="mt-8 text-sm font-semibold text-content-strong">Current policies</h2>
        <div className="mt-2 space-y-1" data-testid="retention-policies">
          {policies.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded border border-border bg-surface-1 px-3 py-2 text-sm">
              <span className="text-content-strong">{p.entityType}</span>
              <span className="text-content-muted">{p.days} days</span>
            </div>
          ))}
          {policies.length === 0 && <p className="text-sm text-content-muted" data-testid="retention-empty">No policies set — apply a tier above.</p>}
        </div>
      </div>
    </main>
    </RequirePermission>
  );
}
