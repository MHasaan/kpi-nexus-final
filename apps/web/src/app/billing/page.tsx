'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../components/app-shell';
import { RequirePermission } from '../../components/auth/require-permission';
import { ApiError, getAccessToken, getBilling, type BillingStatus } from '../../lib/api-client';
import { currentLoginRedirect } from '../../lib/auth-redirect';

export default function BillingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await getBilling());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load billing');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void load();
  }, [load, router]);

  return (
    <AppShell>
      <RequirePermission permission="ORG_SETTINGS">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="billing-heading">Billing &amp; plan</h1>
          <p className="mt-1 text-sm text-content-muted">Your current plan, included features, and usage against quotas.</p>

          {error && <p className="mt-4 text-sm text-status-critical" data-testid="billing-error">{error}</p>}
          {!status && !error && <p className="mt-6 text-sm text-content-muted">Loading…</p>}

          {status && (
            <div className="mt-6 space-y-6">
              <section className="flex items-center justify-between rounded-lg border border-border bg-surface-1 p-6" data-testid="billing-plan">
                <div>
                  <p className="text-xs uppercase tracking-wide text-content-muted">Current plan</p>
                  <p className="mt-1 text-xl font-semibold text-content-strong" data-testid="billing-plan-name">{status.displayName}</p>
                  <p className="text-xs text-content-muted" data-testid="billing-plan-key">{status.planKey}</p>
                </div>
                <button
                  type="button"
                  disabled
                  data-testid="billing-upgrade"
                  title="Self-serve upgrades are coming soon"
                  className="cursor-not-allowed rounded-md bg-accent-primary/40 px-5 py-2.5 text-sm font-medium text-white opacity-70"
                >
                  Upgrade (coming soon)
                </button>
              </section>

              <section className="rounded-lg border border-border bg-surface-1 p-6">
                <h2 className="text-sm font-semibold text-content-strong">Usage</h2>
                <div className="mt-4 space-y-4" data-testid="billing-quotas">
                  {status.quotas.length === 0 && (
                    <p className="text-sm text-content-muted" data-testid="billing-quotas-empty">No metered quotas on this plan.</p>
                  )}
                  {status.quotas.map((q) => {
                    const unlimited = q.limit <= 0;
                    const pct = unlimited ? 0 : Math.min(100, Math.round((q.current / q.limit) * 100));
                    return (
                      <div key={q.key} data-testid={`billing-quota-${q.key}`}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium capitalize text-content-strong">{q.key}</span>
                          <span className="text-content-muted">
                            {q.current} / {unlimited ? '∞' : q.limit}
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded bg-surface-2">
                          <div
                            className={`h-full ${pct >= 90 ? 'bg-status-critical' : pct >= 70 ? 'bg-status-warning' : 'bg-accent-primary'}`}
                            style={{ width: unlimited ? '0%' : `${pct}%` }}
                            data-testid={`billing-quota-bar-${q.key}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-lg border border-border bg-surface-1 p-6">
                <h2 className="text-sm font-semibold text-content-strong">Included features</h2>
                <div className="mt-3 flex flex-wrap gap-2" data-testid="billing-features">
                  {status.features.length === 0 && (
                    <p className="text-sm text-content-muted">No add-on features on this plan.</p>
                  )}
                  {status.features.map((f) => (
                    <span key={f} className="rounded-full border border-border bg-surface-bg px-3 py-1 text-xs text-content-default" data-testid={`billing-feature-${f}`}>
                      {f}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </RequirePermission>
    </AppShell>
  );
}
