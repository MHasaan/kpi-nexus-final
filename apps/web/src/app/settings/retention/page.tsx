'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import {
  type RetentionPolicyRow,
  type RetentionPreviewRow,
  applyRetentionTier,
  listRetention,
  listRetentionTiers,
  previewRetention,
  runRetentionPurge,
  updateRetentionPolicy,
} from '../../../lib/polish-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { useConfirm } from '../../../lib/use-confirm';
import { usePermissions } from '../../../lib/use-permissions';
import { useToast } from '../../../lib/use-toast';
import { useFormat } from '../../../lib/format-context';

/** The five kinds of row a policy can cover, in the words a person uses. */
const ENTITY_LABELS: Record<string, string> = {
  audit_log: 'Audit log',
  ingestion_job: 'Import jobs',
  kpi_data_point: 'KPI values',
  notification_delivery: 'Notification deliveries',
  report_run: 'Report runs',
};
const ENTITY_ORDER = ['kpi_data_point', 'audit_log', 'notification_delivery', 'report_run', 'ingestion_job'];
const TIER_LABELS: Record<string, string> = { FREE: 'Short', PRO: 'One year', ENTERPRISE: 'Seven years' };

const labelOf = (entityType: string) => ENTITY_LABELS[entityType] ?? entityType;

export default function RetentionSettingsPage() {
  const fmt = useFormat();
  const router = useRouter();
  const confirm = useConfirm();
  const rowsText = (n: number) => `${fmt.number(n)} ${n === 1 ? 'row' : 'rows'}`;
  const toast = useToast();
  const [policies, setPolicies] = useState<RetentionPolicyRow[] | null>(null);
  const [tiers, setTiers] = useState<Array<{ tier: string; days: number }>>([]);
  const [preview, setPreview] = useState<RetentionPreviewRow[] | null>(null);
  const [days, setDays] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = useCallback((rows: RetentionPolicyRow[]) => {
    setPolicies(rows);
    setDays(Object.fromEntries(rows.map((p) => [p.entityType, String(p.days)])));
    // Counts belong to the policies as they were when counted.
    setPreview(null);
  }, []);

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([listRetention(), listRetentionTiers()]);
      show(p);
      setTiers(t);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load retention');
    }
  }, [show]);

  // FE-014: load only once the page gate passes, so users without access
  // are redirected without first drawing a 403 from the api.
  const { ready, has } = usePermissions();
  const allowed = ready && has('ORG_SETTINGS');
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (!allowed) return;
    void load();
  }, [load, router, allowed]);

  /** Run one action with the row (or button) marked busy, and say why if it fails. */
  const act = async (key: string, fn: () => Promise<void>, failed: string) => {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : failed);
    } finally {
      setBusy(null);
    }
  };

  const applyTier = (tier: string, tierDays: number) =>
    void confirm({
      title: `Keep everything for ${tierDays} days?`,
      description: 'This sets all five periods. Purging is turned off for every period that changes, so nothing is deleted until you turn it on again.',
      confirmLabel: 'Set all periods',
      testId: 'retention-tier-confirm',
      action: async () => show(await applyRetentionTier(tier)),
    });

  const saveDays = (entityType: string) => {
    const value = Number(days[entityType]);
    if (!Number.isInteger(value) || value < 1 || value > 36500) {
      setError(`${labelOf(entityType)}: the number of days must be a whole number from 1 to 36500.`);
      return;
    }
    void act(entityType, async () => show(await updateRetentionPolicy(entityType, { days: value })), 'The period could not be saved');
  };

  const turnOn = (policy: RetentionPolicyRow) =>
    void act(
      policy.entityType,
      async () => {
        // Count first, so the question says what the first run will remove.
        const counted = (await previewRetention()).find((r) => r.entityType === policy.entityType);
        const rows = counted?.rows ?? 0;
        await confirm({
          title: `Turn on purging for ${labelOf(policy.entityType).toLowerCase()}?`,
          description: `Every night, ${labelOf(policy.entityType).toLowerCase()} older than ${policy.days} days will be deleted for good. The first run will delete ${rowsText(rows)}. This cannot be undone.`,
          confirmLabel: 'Turn purging on',
          tone: 'danger',
          testId: 'retention-purging-confirm',
          action: async () => show(await updateRetentionPolicy(policy.entityType, { purging: true })),
        });
      },
      'Purging could not be turned on',
    );

  const turnOff = (policy: RetentionPolicyRow) =>
    void act(policy.entityType, async () => show(await updateRetentionPolicy(policy.entityType, { purging: false })), 'Purging could not be turned off');

  const runPreview = () => void act('preview', async () => setPreview(await previewRetention()), 'The preview could not be made');

  const runNow = () =>
    void act(
      'run',
      async () => {
        const counted = (await previewRetention()).filter((r) => r.purging);
        const rows = counted.reduce((n, r) => n + r.rows, 0);
        await confirm({
          title: 'Run the purge now?',
          description: `${rowsText(rows)} will be deleted for good, from: ${counted.map((r) => labelOf(r.entityType).toLowerCase()).join(', ')}. This cannot be undone.`,
          confirmLabel: 'Delete now',
          tone: 'danger',
          testId: 'retention-run-confirm',
          action: async () => {
            const result = await runRetentionPurge();
            toast.success(`${rowsText(result.deleted)} deleted`);
            show(await listRetention());
          },
        });
      },
      'The purge could not be run',
    );

  const ordered = policies ? [...policies].sort((a, b) => ENTITY_ORDER.indexOf(a.entityType) - ENTITY_ORDER.indexOf(b.entityType)) : null;
  const anyOn = Boolean(policies?.some((p) => p.purgeEnabledAt));

  // FE-014: same permission the page's API enforces — no broken 403 screens.
  return (
    <AppShell title="Data retention" crumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Data retention' }]}>
    <RequirePermission permission="ORG_SETTINGS">

      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-content-strong">Data retention</h1>
        <p className="mt-1 text-sm text-content-muted" data-testid="retention-intro">
          How long each kind of data is kept. Setting a period deletes nothing by itself: old data is only deleted for a period you turn purging on for, once a night.
        </p>
        {error && <p role="alert" className="mt-3 rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical" data-testid="retention-error">{error}</p>}

        <h2 className="mt-6 text-sm font-semibold text-content-strong">Set all periods at once</h2>
        <div className="mt-2 grid gap-4 sm:grid-cols-3" data-testid="retention-tiers">
          {tiers.map((t) => (
            <div key={t.tier} data-testid={`tier-${t.tier}`} className="rounded-lg border border-border bg-surface-1 p-5 text-center">
              <h3 className="font-semibold text-content-strong">{TIER_LABELS[t.tier] ?? t.tier}</h3>
              <p className="mt-1 text-sm text-content-muted">{t.days} days</p>
              <button type="button" data-testid={`apply-tier-${t.tier}`} onClick={() => applyTier(t.tier, t.days)} className="mt-3 rounded bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Apply</button>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-content-strong">Periods</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={runPreview} disabled={busy !== null || !ordered?.length} data-testid="retention-preview" className="rounded-md border border-border-strong bg-surface-bg px-3 py-1.5 text-xs font-medium text-content-strong hover:bg-surface-hover disabled:opacity-50">
              {busy === 'preview' ? 'Counting…' : 'Count what is old enough to delete'}
            </button>
            {anyOn && (
              <button type="button" onClick={runNow} disabled={busy !== null} data-testid="retention-run" className="rounded-md border border-status-critical/50 bg-surface-bg px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10 disabled:opacity-50">
                {busy === 'run' ? 'Working…' : 'Run the purge now'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 space-y-2" data-testid="retention-policies">
          {!ordered && !error && <p className="text-sm text-content-muted">Loading…</p>}
          {ordered?.map((p) => {
            const counted = preview?.find((r) => r.entityType === p.entityType);
            const on = p.purgeEnabledAt !== null;
            return (
              <div key={p.id} data-testid={`retention-policy-${p.entityType}`} className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-40 font-medium text-content-strong">{labelOf(p.entityType)}</span>
                  <label className="flex items-center gap-2 text-content-muted">
                    Keep for
                    <input
                      inputMode="numeric"
                      aria-label={`Days to keep ${labelOf(p.entityType).toLowerCase()}`}
                      value={days[p.entityType] ?? ''}
                      onChange={(e) => setDays((d) => ({ ...d, [p.entityType]: e.target.value }))}
                      data-testid={`retention-days-${p.entityType}`}
                      className="w-20 rounded-md border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong"
                    />
                    days
                  </label>
                  {days[p.entityType] !== String(p.days) && (
                    <button type="button" onClick={() => saveDays(p.entityType)} disabled={busy !== null} data-testid={`retention-save-${p.entityType}`} className="rounded-md bg-accent-primary px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                      Save
                    </button>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <span data-testid={`retention-purging-${p.entityType}`} className={`rounded-full px-2 py-0.5 text-xs font-medium ${on ? 'bg-status-critical/10 text-status-critical' : 'bg-surface-2 text-content-muted'}`}>
                      {on ? 'Purging on' : 'Purging off'}
                    </span>
                    {on ? (
                      <button type="button" onClick={() => turnOff(p)} disabled={busy !== null} data-testid={`retention-off-${p.entityType}`} className="rounded-md border border-border-strong bg-surface-bg px-3 py-1 text-xs font-medium text-content-strong hover:bg-surface-hover disabled:opacity-50">
                        Turn off
                      </button>
                    ) : (
                      <button type="button" onClick={() => turnOn(p)} disabled={busy !== null} data-testid={`retention-on-${p.entityType}`} className="rounded-md border border-status-critical/50 bg-surface-bg px-3 py-1 text-xs font-medium text-status-critical hover:bg-status-critical/10 disabled:opacity-50">
                        Turn purging on…
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-xs text-content-muted" data-testid={`retention-status-${p.entityType}`}>
                  {counted ? `${rowsText(counted.rows)} older than ${counted.days} days. ` : ''}
                  {p.lastRunAt
                    ? `Last purge ${fmt.dateTime(p.lastRunAt)}: ${rowsText(p.lastRunDeleted ?? 0)} deleted.`
                    : on
                      ? 'Not purged yet — the first run is tonight.'
                      : 'Nothing has been deleted.'}
                </p>
              </div>
            );
          })}
          {ordered?.length === 0 && <p className="text-sm text-content-muted" data-testid="retention-empty">No periods set — choose one above to set all five.</p>}
        </div>
      </div>
    </RequirePermission>
    </AppShell>
  );
}
