'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createKpi,
  deleteKpi,
  getAccessToken,
  listKpiDataPoints,
  listKpis,
  listOrgUnits,
  listUsers,
  recordOrgWideDataPoint,
  type DataPoint,
  type KpiScope,
  type KpiSummary,
  type KpiType,
  type OrgUnitSummary,
  type UserSummary,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';

export default function KpisPage() {
  return (
    <TerminologyProvider>
      <KpisPageInner />
    </TerminologyProvider>
  );
}

function KpisPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [kpis, setKpis] = useState<KpiSummary[] | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitSummary[] | null>(null);
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create-KPI form state
  const [newName, setNewName] = useState('');
  const [newScope, setNewScope] = useState<KpiScope>('ORG_WIDE');
  const [newType, setNewType] = useState<KpiType>('NUMBER');
  const [newUnit, setNewUnit] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newOrgUnitIds, setNewOrgUnitIds] = useState<string[]>([]);
  const [newUserIds, setNewUserIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Expanded-KPI state (showing data points + record form)
  const [expandedKpiId, setExpandedKpiId] = useState<string | null>(null);
  const [dataPoints, setDataPoints] = useState<DataPoint[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Record-value form state
  const [recordValue, setRecordValue] = useState('');
  const [recordPeriodStart, setRecordPeriodStart] = useState('');
  const [recordPeriodEnd, setRecordPeriodEnd] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router]);

  async function refresh() {
    setLoadError(null);
    try {
      const [k, u, units] = await Promise.all([listKpis(), listUsers(), listOrgUnits()]);
      setKpis(k);
      setUsers(u);
      setOrgUnits(units);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load KPIs');
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const target = newTarget.trim() ? Number.parseFloat(newTarget) : undefined;
      await createKpi({
        name: newName.trim(),
        scope: newScope,
        type: newType,
        unit: newUnit.trim() || undefined,
        targetValue: target,
        orgUnitIds: newScope === 'PER_UNIT' ? newOrgUnitIds : undefined,
        userIds: newScope === 'PER_USER' ? newUserIds : undefined,
      });
      setNewName('');
      setNewUnit('');
      setNewTarget('');
      setNewOrgUnitIds([]);
      setNewUserIds([]);
      await refresh();
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : 'Failed to create KPI',
      );
    } finally {
      setCreating(false);
    }
  }

  function toggleSelection(
    set: string[],
    setter: (next: string[]) => void,
    id: string,
  ) {
    if (set.includes(id)) {
      setter(set.filter((x) => x !== id));
    } else {
      setter([...set, id]);
    }
  }

  async function handleDelete(kpi: KpiSummary) {
    setDeletingId(kpi.id);
    try {
      await deleteKpi(kpi.id);
      if (expandedKpiId === kpi.id) {
        setExpandedKpiId(null);
        setDataPoints(null);
      }
      await refresh();
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : `Failed to delete ${kpi.name}`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExpand(kpi: KpiSummary) {
    if (expandedKpiId === kpi.id) {
      setExpandedKpiId(null);
      setDataPoints(null);
      return;
    }
    setExpandedKpiId(kpi.id);
    setDataLoading(true);
    setDataError(null);
    setDataPoints(null);
    setRecordValue('');
    setRecordPeriodStart('');
    setRecordPeriodEnd('');
    setRecordError(null);
    try {
      setDataPoints(await listKpiDataPoints(kpi.id));
    } catch (err) {
      setDataError(
        err instanceof ApiError ? err.message : 'Failed to load data points',
      );
    } finally {
      setDataLoading(false);
    }
  }

  async function handleRecord(kpi: KpiSummary, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecording(true);
    setRecordError(null);
    try {
      const value = Number.parseFloat(recordValue);
      if (!Number.isFinite(value)) {
        throw new Error('Value must be a number');
      }
      await recordOrgWideDataPoint(kpi.id, {
        value,
        periodStart: recordPeriodStart,
        periodEnd: recordPeriodEnd,
      });
      setRecordValue('');
      setRecordPeriodStart('');
      setRecordPeriodEnd('');
      setDataPoints(await listKpiDataPoints(kpi.id));
    } catch (err) {
      setRecordError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to record value',
      );
    } finally {
      setRecording(false);
    }
  }

  const kpiLabelPlural = pluralize(terminology.kpiLabel);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-content-strong hover:text-accent-primary"
            >
              KPI Nexus
            </Link>
            <nav className="flex flex-wrap gap-4 text-sm">
              <Link href="/dashboard" className="text-content-muted hover:text-content-strong">
                Dashboard
              </Link>
              <Link
                href="/kpis"
                className="font-medium text-accent-primary"
                data-testid="nav-kpis"
              >
                {kpiLabelPlural}
              </Link>
              <Link href="/users" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.memberLabel)}
              </Link>
              <Link href="/org-units" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.groupLabel)}
              </Link>
              <Link href="/roles" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.roleLabel)}
              </Link>
              <Link href="/positions" className="text-content-muted hover:text-content-strong">
                Positions
              </Link>
              <Link href="/profile" className="text-content-muted hover:text-content-strong">
                Profile
              </Link>
              <Link
                href="/settings/organization"
                className="text-content-muted hover:text-content-strong"
              >
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1
            className="text-2xl font-semibold text-content-strong"
            data-testid="kpis-heading"
          >
            {kpiLabelPlural}
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Track outcomes that matter. {kpiLabelPlural} have a scope:
            ORG_WIDE (one value per period for the whole org), PER_UNIT
            (one value per unit), or PER_USER (each {terminology.memberLabel.toLowerCase()}
            {' '}tracks their own).
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            data-testid="kpis-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <section
          className="mb-8 rounded-lg border border-border bg-surface-1 p-6"
          data-testid="create-kpi-section"
        >
          <h2 className="text-lg font-semibold text-content-strong">
            Create a {terminology.kpiLabel}
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            ORG_WIDE: one value per period for the whole organization.
            PER_UNIT: one value per selected {pluralize(terminology.groupLabel.toLowerCase())}.
            PER_USER: each selected {terminology.memberLabel.toLowerCase()} tracks their own.
          </p>
          <form
            onSubmit={handleCreate}
            className="mt-4 grid gap-4 sm:grid-cols-[1.5fr_0.7fr_0.7fr_0.7fr_0.7fr_auto] sm:items-end"
          >
            <label className="block">
              <span className="text-sm font-medium text-content-default">Name</span>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
                data-testid="kpi-name-input"
                placeholder="Monthly revenue"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Scope</span>
              <select
                value={newScope}
                onChange={(e) => setNewScope(e.target.value as KpiScope)}
                disabled={creating}
                data-testid="kpi-scope-select"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              >
                <option value="ORG_WIDE">ORG_WIDE</option>
                <option value="PER_UNIT">PER_UNIT</option>
                <option value="PER_USER">PER_USER</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Type</span>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as KpiType)}
                disabled={creating}
                data-testid="kpi-type-select"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              >
                <option value="NUMBER">Number</option>
                <option value="PERCENTAGE">Percentage</option>
                <option value="CURRENCY">Currency</option>
                <option value="COUNT">Count</option>
                <option value="DURATION">Duration</option>
                <option value="RATING">Rating</option>
                <option value="BOOLEAN">Boolean</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Unit</span>
              <input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                disabled={creating}
                data-testid="kpi-unit-input"
                placeholder="$, %, ms"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Target</span>
              <input
                type="number"
                step="any"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                disabled={creating}
                data-testid="kpi-target-input"
                placeholder="optional"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              data-testid="kpi-submit-button"
              className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
          {newScope === 'PER_UNIT' && (
            <div className="mt-4" data-testid="kpi-orgunit-picker">
              <span className="text-sm font-medium text-content-default">
                Assigned {pluralize(terminology.groupLabel.toLowerCase())}
              </span>
              <p className="text-xs text-content-muted">
                Each selected unit will track its own value for this KPI.
              </p>
              {orgUnits === null && (
                <p className="mt-2 text-sm text-content-muted">Loading…</p>
              )}
              {orgUnits && orgUnits.length === 0 && (
                <p
                  className="mt-2 text-sm text-content-muted"
                  data-testid="kpi-no-orgunits"
                >
                  Create at least one {terminology.groupLabel.toLowerCase()} on{' '}
                  <Link href="/org-units" className="underline">
                    /org-units
                  </Link>{' '}
                  first.
                </p>
              )}
              {orgUnits && orgUnits.length > 0 && (
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-3">
                  {orgUnits.map((u) => (
                    <li key={u.id}>
                      <label className="flex items-center gap-2 rounded border border-border bg-surface-bg px-2 py-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={newOrgUnitIds.includes(u.id)}
                          onChange={() =>
                            toggleSelection(newOrgUnitIds, setNewOrgUnitIds, u.id)
                          }
                          data-testid={`orgunit-checkbox-${u.name}`}
                          disabled={creating}
                          className="rounded border-border text-accent-primary focus:ring-accent-primary"
                        />
                        <span>{u.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {newScope === 'PER_USER' && (
            <div className="mt-4" data-testid="kpi-user-picker">
              <span className="text-sm font-medium text-content-default">
                Assigned {pluralize(terminology.memberLabel.toLowerCase())}
              </span>
              <p className="text-xs text-content-muted">
                Each selected {terminology.memberLabel.toLowerCase()} will
                record their own values via /user-kpis/my-kpis.
              </p>
              {users && users.length === 0 && (
                <p className="mt-2 text-sm text-content-muted">
                  No {pluralize(terminology.memberLabel.toLowerCase())} yet.
                </p>
              )}
              {users && users.length > 0 && (
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-3">
                  {users.map((u) => (
                    <li key={u.id}>
                      <label className="flex items-center gap-2 rounded border border-border bg-surface-bg px-2 py-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={newUserIds.includes(u.id)}
                          onChange={() =>
                            toggleSelection(newUserIds, setNewUserIds, u.id)
                          }
                          data-testid={`user-checkbox-${u.email}`}
                          disabled={creating}
                          className="rounded border-border text-accent-primary focus:ring-accent-primary"
                        />
                        <span>{u.email}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {createError && (
            <p
              role="alert"
              data-testid="kpi-error"
              className="mt-3 text-sm text-status-critical"
            >
              {createError}
            </p>
          )}
        </section>

        <section data-testid="kpis-list-section">
          {kpis === null && !loadError && (
            <p className="text-sm text-content-muted">
              Loading {kpiLabelPlural.toLowerCase()}…
            </p>
          )}
          {kpis && kpis.length === 0 && (
            <p className="text-sm text-content-muted" data-testid="kpis-empty">
              No {kpiLabelPlural.toLowerCase()} yet.
            </p>
          )}
          {kpis && kpis.length > 0 && (
            <ul className="space-y-3" data-testid="kpis-list">
              {kpis.map((kpi) => (
                <li
                  key={kpi.id}
                  className="rounded-lg border border-border bg-surface-1"
                  data-testid={`kpi-row-${kpi.name}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div>
                      <h3 className="text-base font-semibold text-content-strong">
                        {kpi.name}
                        <ScopeBadge scope={kpi.scope} />
                        <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-content-default">
                          {kpi.type}
                        </span>
                        <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-content-default">
                          {kpi.frequency}
                        </span>
                      </h3>
                      {kpi.unit && (
                        <p className="mt-1 text-xs text-content-muted">
                          Unit: <span className="font-mono">{kpi.unit}</span>
                        </p>
                      )}
                      {kpi.targetValue !== null && (
                        <p className="mt-0.5 text-xs text-content-muted">
                          Target: {kpi.targetValue}
                        </p>
                      )}
                      {kpi.scope === 'PER_UNIT' && kpi.orgUnitAssignments.length > 0 && (
                        <p
                          className="mt-0.5 text-xs text-content-muted"
                          data-testid={`kpi-assignment-count-${kpi.name}`}
                        >
                          {kpi.orgUnitAssignments.length} unit
                          {kpi.orgUnitAssignments.length === 1 ? '' : 's'} assigned
                        </p>
                      )}
                      {kpi.scope === 'PER_USER' && kpi.userAssignments.length > 0 && (
                        <p
                          className="mt-0.5 text-xs text-content-muted"
                          data-testid={`kpi-assignment-count-${kpi.name}`}
                        >
                          {kpi.userAssignments.length}{' '}
                          {pluralize(terminology.memberLabel.toLowerCase()).slice(
                            0,
                            kpi.userAssignments.length === 1
                              ? terminology.memberLabel.length
                              : undefined,
                          )}{' '}
                          assigned
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {kpi.scope === 'ORG_WIDE' && (
                        <button
                          type="button"
                          onClick={() => void handleExpand(kpi)}
                          data-testid={`expand-kpi-${kpi.name}`}
                          className="rounded-md border border-border px-3 py-1.5 text-sm text-content-default transition hover:bg-surface-2"
                        >
                          {expandedKpiId === kpi.id ? 'Hide data' : 'Record value'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDelete(kpi)}
                        disabled={deletingId === kpi.id}
                        data-testid={`delete-kpi-${kpi.name}`}
                        className="rounded-md border border-border px-3 py-1.5 text-sm text-status-critical transition hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingId === kpi.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {expandedKpiId === kpi.id && (
                    <div
                      className="border-t border-border bg-surface-bg p-4"
                      data-testid={`kpi-data-panel-${kpi.name}`}
                    >
                      <h4 className="text-sm font-semibold text-content-strong">
                        Record a value
                      </h4>
                      <form
                        onSubmit={(e) => void handleRecord(kpi, e)}
                        className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
                      >
                        <label className="block">
                          <span className="text-sm font-medium text-content-default">Value</span>
                          <input
                            required
                            type="number"
                            step="any"
                            value={recordValue}
                            onChange={(e) => setRecordValue(e.target.value)}
                            disabled={recording}
                            data-testid="record-value-input"
                            className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-content-default">Period start</span>
                          <input
                            required
                            type="date"
                            value={recordPeriodStart}
                            onChange={(e) => setRecordPeriodStart(e.target.value)}
                            disabled={recording}
                            data-testid="record-start-input"
                            className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm font-medium text-content-default">Period end</span>
                          <input
                            required
                            type="date"
                            value={recordPeriodEnd}
                            onChange={(e) => setRecordPeriodEnd(e.target.value)}
                            disabled={recording}
                            data-testid="record-end-input"
                            className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={recording}
                          data-testid="record-submit-button"
                          className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {recording ? 'Saving…' : 'Save'}
                        </button>
                      </form>
                      {recordError && (
                        <p
                          role="alert"
                          data-testid="record-error"
                          className="mt-2 text-sm text-status-critical"
                        >
                          {recordError}
                        </p>
                      )}

                      <h4 className="mt-5 text-sm font-semibold text-content-strong">
                        Recent values
                      </h4>
                      {dataError && (
                        <p role="alert" className="mt-2 text-sm text-status-critical">
                          {dataError}
                        </p>
                      )}
                      {dataLoading && (
                        <p className="mt-2 text-sm text-content-muted">Loading…</p>
                      )}
                      {dataPoints && dataPoints.length === 0 && (
                        <p
                          className="mt-2 text-sm text-content-muted"
                          data-testid="no-data-points"
                        >
                          No values recorded yet.
                        </p>
                      )}
                      {dataPoints && dataPoints.length > 0 && (
                        <ul
                          className="mt-2 space-y-1 text-sm"
                          data-testid={`data-points-${kpi.name}`}
                        >
                          {dataPoints.slice(0, 20).map((dp) => (
                            <li
                              key={dp.id}
                              data-testid={`data-point-row`}
                              className="flex items-center justify-between rounded bg-surface-1 px-3 py-1.5"
                            >
                              <span className="font-mono">
                                {dp.value}
                                {kpi.unit ? ` ${kpi.unit}` : ''}
                              </span>
                              <span className="text-xs text-content-muted">
                                {dp.periodStart.slice(0, 10)} → {dp.periodEnd.slice(0, 10)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function ScopeBadge({ scope }: { scope: KpiScope }) {
  const cls = {
    ORG_WIDE: 'bg-accent-primary/10 text-accent-primary',
    PER_UNIT: 'bg-status-success/10 text-status-success',
    PER_USER: 'bg-status-warning/10 text-status-warning',
  }[scope];
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}
      data-testid="kpi-scope-badge"
    >
      {scope}
    </span>
  );
}
