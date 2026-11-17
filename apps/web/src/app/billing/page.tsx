'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../components/app-shell';
import { RequireAnyPermission } from '../../components/auth/require-permission';
import {
  ApiError,
  getAccessToken,
  getBilling,
  listBillingPlans,
  setBillingPlan,
  type BillingPlan,
  type BillingStatus,
} from '../../lib/api-client';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { useAllowedAny } from '../../lib/use-allowed';
import { useConfirm } from '../../lib/use-confirm';
import { useToast } from '../../lib/use-toast';

/** Who may open this page — the same keys `GET /billing` accepts. */
const BILLING_KEYS = ['BILLING_MANAGE', 'ORG_SETTINGS'];

const QUOTA_LABELS: Record<string, string> = { kpis: 'KPIs', dashboards: 'Dashboards', users: 'People' };

const FEATURE_LABELS: Record<string, string> = {
  ai_insights: 'AI insights',
  webhooks: 'Webhooks',
  scheduled_reports: 'Scheduled reports',
  sso: 'Single sign-on',
  custom_domain: 'Custom domain',
  api_keys: 'API keys',
};

function limitsOf(plan: BillingPlan): string {
  const parts = Object.entries(plan.quotas).map(([key, limit]) => `${limit <= 0 ? 'Unlimited' : limit} ${QUOTA_LABELS[key] ?? key}`);
  return parts.length > 0 ? parts.join(' · ') : 'No limits';
}

export default function BillingPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [current, available] = await Promise.all([getBilling(), listBillingPlans()]);
      setStatus(current);
      setPlans(available);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load billing');
    }
  }, []);

  // Nothing is asked for until the person is known to be allowed this page.
  const allowed = useAllowedAny(BILLING_KEYS);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (!allowed) return;
    void load();
  }, [load, router, allowed]);

  function choose(plan: BillingPlan) {
    void confirm({
      title: `Move to the ${plan.displayName} plan?`,
      description: `Limits become: ${limitsOf(plan)}. Nothing already created is removed, but nothing more can be added above a limit. No payment is taken.`,
      confirmLabel: `Move to ${plan.displayName}`,
      testId: 'billing-plan-confirm',
      action: async () => {
        setStatus(await setBillingPlan(plan.key));
        toast.success(`The organisation is on the ${plan.displayName} plan`);
      },
    });
  }

  return (
    <AppShell>
      <RequireAnyPermission permissions={BILLING_KEYS}>
        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="billing-heading">Billing &amp; plan</h1>
          <p className="mt-1 text-sm text-content-muted">Your current plan, included features, and usage against quotas.</p>

          {error && <p className="mt-4 text-sm text-status-critical" data-testid="billing-error">{error}</p>}
          {!status && !error && <p className="mt-6 text-sm text-content-muted">Loading…</p>}

          {status && (
            <div className="mt-6 space-y-6">
              <section className="rounded-lg border border-border bg-surface-1 p-6" data-testid="billing-plan">
                <div>
                  <p className="text-xs uppercase tracking-wide text-content-muted">Current plan</p>
                  <p className="mt-1 text-xl font-semibold text-content-strong" data-testid="billing-plan-name">{status.displayName}</p>
                </div>
              </section>

              {plans && (
                <section className="rounded-lg border border-border bg-surface-1 p-6" data-testid="billing-plans">
                  <h2 className="text-sm font-semibold text-content-strong">Plans</h2>
                  <p className="mt-1 text-xs text-content-muted" data-testid="billing-no-payment">
                    No payment is taken in this deployment. Choosing a plan only changes the limits below.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {plans.map((plan) => {
                      const current = plan.key === status.planKey;
                      return (
                        <li
                          key={plan.key}
                          data-testid={`billing-plan-option-${plan.key}`}
                          className={`flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 ${current ? 'border-accent-primary bg-accent-primary/5' : 'border-border bg-surface-bg'}`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-content-strong">{plan.displayName}</p>
                            <p className="text-xs text-content-muted">{limitsOf(plan)}</p>
                          </div>
                          {current ? (
                            <span className="text-xs font-medium text-accent-primary" data-testid="billing-plan-current">Current plan</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => choose(plan)}
                              data-testid={`billing-plan-choose-${plan.key}`}
                              className="rounded-md border border-border-strong bg-surface-bg px-3 py-1.5 text-sm font-medium text-content-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              Move to this plan
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

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
                          <span className="font-medium text-content-strong">{QUOTA_LABELS[q.key] ?? q.key}</span>
                          <span className="text-content-muted">
                            {unlimited ? `${q.current} · no limit` : `${q.current} of ${q.limit}`}
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
                      {FEATURE_LABELS[f] ?? f}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </RequireAnyPermission>
    </AppShell>
  );
}
