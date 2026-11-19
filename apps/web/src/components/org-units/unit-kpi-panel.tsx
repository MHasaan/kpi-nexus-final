'use client';

import Link from 'next/link';
import { type FormEvent, type ReactNode, useState } from 'react';

import {
  ApiError,
  assignKpiToUnit,
  listKpis,
  listUnitKpis,
  recordUnitKpiData,
  unassignKpiFromUnit,
  type OrgUnitSummary,
  type UnitKpiRow,
} from '../../lib/api-client';
import { ASSIGNMENT_STATUS_LABELS, labelFor } from '../../lib/labels';
import { useAsyncData } from '../../lib/use-async-data';
import { useConfirm } from '../../lib/use-confirm';
import { useToast } from '../../lib/use-toast';
import { PermissionGuard } from '../auth/permission-guard';
import { RecordValueForm } from '../kpis/record-value-form';
import { Button, Input, Label, Select, Skeleton } from '../ui';
import { parseTarget, unitKpiCandidates } from './unit-kpi-candidates';

export interface UnitKpiPanelProps {
  unit: OrgUnitSummary;
  /** Every unit, to name the one an inherited KPI comes from. */
  allUnits: readonly OrgUnitSummary[];
}

/**
 * The KPIs one unit holds — its own and the ones it inherits from a parent —
 * with everything that can be done to them from the unit's side: assign one,
 * give the unit its own target, record a value, take one away (plan 2.9).
 */
export function UnitKpiPanel({ unit, allUnits }: UnitKpiPanelProps) {
  const rows = useAsyncData(() => listUnitKpis(unit.id), [unit.id]);
  const kpis = useAsyncData(() => listKpis(), []);
  const confirm = useConfirm();
  const toast = useToast();

  const [assignKpiId, setAssignKpiId] = useState('');
  const [assignTarget, setAssignTarget] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState('');
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  const [recordingKpiId, setRecordingKpiId] = useState<string | null>(null);

  const held = rows.data ?? [];
  const candidates = unitKpiCandidates(kpis.data ?? [], held);
  const frequencyOf = (kpiId: string) => kpis.data?.find((k) => k.id === kpiId)?.frequency ?? 'MONTHLY';
  const unitName = (id: string | null) => allUnits.find((u) => u.id === id)?.name ?? 'a parent unit';

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    setAssignError(null);
    const kpiId = assignKpiId || candidates[0]?.id;
    if (!kpiId) return;
    const target = parseTarget(assignTarget);
    if (!target.ok) {
      setAssignError('The target must be a number.');
      return;
    }
    setAssigning(true);
    try {
      await assignKpiToUnit(unit.id, kpiId, target.value);
      setAssignKpiId('');
      setAssignTarget('');
      rows.reload();
      toast.success('KPI assigned');
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : 'Could not assign this KPI.');
    } finally {
      setAssigning(false);
    }
  };

  const startEdit = (row: UnitKpiRow) => {
    setRecordingKpiId(null);
    setTargetError(null);
    setEditingKpiId(row.kpiId);
    setEditTarget(row.targetValue === null ? '' : String(row.targetValue));
  };

  const saveTarget = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingKpiId) return;
    setTargetError(null);
    const target = parseTarget(editTarget);
    if (!target.ok) {
      setTargetError('The target must be a number.');
      return;
    }
    setSavingTarget(true);
    try {
      // Assigning at this unit makes the row the unit's own, with this target.
      await assignKpiToUnit(unit.id, editingKpiId, target.value);
      setEditingKpiId(null);
      rows.reload();
      toast.success('Target saved');
    } catch (err) {
      setTargetError(err instanceof ApiError ? err.message : 'Could not save the target.');
    } finally {
      setSavingTarget(false);
    }
  };

  const remove = async (row: UnitKpiRow) => {
    await confirm({
      title: `Remove ${row.name} from ${unit.name}?`,
      description:
        'The unit stops holding this KPI, and so do the units below it that inherit it. Values already recorded are kept.',
      confirmLabel: 'Remove',
      tone: 'danger',
      testId: 'unit-kpi-remove-confirm',
      action: async () => {
        await unassignKpiFromUnit(unit.id, row.kpiId);
        rows.reload();
        toast.success('KPI removed');
      },
    });
  };

  return (
    <div className="mt-6 border-t border-border-divider pt-4" data-testid="unit-kpis-panel">
      <div className="kn-eyebrow mb-2">KPIs</div>

      {rows.error && (
        <p role="alert" data-testid="unit-kpis-error" className="mb-2 text-sm text-status-critical">
          {rows.error}{' '}
          <button type="button" className="font-medium underline" onClick={rows.reload}>
            Try again
          </button>
        </p>
      )}
      {rows.loading && !rows.data && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      )}
      {rows.data && held.length === 0 && (
        <p className="text-sm text-content-muted" data-testid="unit-kpis-empty">
          This unit holds no KPIs yet.
        </p>
      )}

      {held.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {held.map((row) => (
            <li
              key={row.assignmentId}
              data-testid={`unit-kpi-row-${row.kpiId}`}
              className="rounded-md bg-surface-bg px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <Link href={`/kpis/${row.kpiId}`} className="font-medium text-content-strong hover:underline">
                    {row.name}
                  </Link>
                  {row.inherited && (
                    <span className="ml-2 text-xs text-content-muted">
                      Inherited from {unitName(row.inheritedFromUnitId)}
                    </span>
                  )}
                </div>
                <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-content-muted">
                  <div className="flex gap-1">
                    <dt>Latest</dt>
                    <dd className="tabular-nums text-content-strong" data-testid="unit-kpi-current">
                      {row.currentValue ?? '—'}
                    </dd>
                    {row.unit && row.currentValue !== null && <dd>{row.unit}</dd>}
                  </div>
                  <div className="flex gap-1">
                    <dt>Target</dt>
                    <dd className="tabular-nums text-content-strong">{row.targetValue ?? '—'}</dd>
                  </div>
                  {row.status && (
                    <div className="flex gap-1">
                      <dt className="sr-only">Status</dt>
                      <dd>{labelFor(ASSIGNMENT_STATUS_LABELS, row.status)}</dd>
                    </div>
                  )}
                </dl>
                <div className="flex flex-wrap gap-1">
                  <PermissionGuard permission="KPI_DATA_ENTRY">
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`unit-kpi-record-toggle-${row.kpiId}`}
                      aria-expanded={recordingKpiId === row.kpiId}
                      onClick={() => {
                        setEditingKpiId(null);
                        setRecordingKpiId((id) => (id === row.kpiId ? null : row.kpiId));
                      }}
                    >
                      {recordingKpiId === row.kpiId ? 'Cancel' : 'Record value'}
                    </Button>
                  </PermissionGuard>
                  <CanAssign>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid={`unit-kpi-target-edit-${row.kpiId}`}
                      onClick={() => (editingKpiId === row.kpiId ? setEditingKpiId(null) : startEdit(row))}
                    >
                      {editingKpiId === row.kpiId ? 'Cancel' : row.inherited ? 'Set own target' : 'Change target'}
                    </Button>
                    {!row.inherited && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-status-critical hover:bg-status-critical-bg"
                      data-testid={`unit-kpi-remove-${row.kpiId}`}
                      onClick={() => void remove(row)}
                    >
                      Remove
                    </Button>
                    )}
                  </CanAssign>
                </div>
              </div>

              {editingKpiId === row.kpiId && (
                <form onSubmit={saveTarget} className="mt-3 flex flex-wrap items-end gap-3" data-testid="unit-kpi-target-form">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`unit-kpi-target-${row.kpiId}`}>
                      Target for {unit.name}
                      {row.unit ? ` (${row.unit})` : ''}
                    </Label>
                    <Input
                      id={`unit-kpi-target-${row.kpiId}`}
                      type="number"
                      step="any"
                      value={editTarget}
                      onChange={(e) => setEditTarget(e.target.value)}
                      data-testid="unit-kpi-target-input"
                      className="w-40"
                    />
                  </div>
                  <Button type="submit" size="sm" isLoading={savingTarget} data-testid="unit-kpi-target-save">
                    Save target
                  </Button>
                  {row.inherited && (
                    <p className="w-full text-xs text-content-muted">
                      Saving makes this KPI the unit&apos;s own: it stops following {unitName(row.inheritedFromUnitId)}.
                    </p>
                  )}
                  {targetError && (
                    <p role="alert" data-testid="unit-kpi-target-error" className="w-full text-sm text-status-critical">
                      {targetError}
                    </p>
                  )}
                </form>
              )}

              {recordingKpiId === row.kpiId && (
                <div className="mt-3">
                  <RecordValueForm
                    frequency={frequencyOf(row.kpiId)}
                    unit={row.unit}
                    testIdPrefix="unit-kpi"
                    onRecord={(body) => recordUnitKpiData(row.assignmentId, body)}
                    onRecorded={() => {
                      setRecordingKpiId(null);
                      rows.reload();
                      toast.success('Value recorded');
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <CanAssign>
        <form onSubmit={assign} className="mt-4 grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end" data-testid="unit-kpi-assign-form">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`unit-kpi-assign-${unit.id}`}>Assign a KPI</Label>
            <Select
              id={`unit-kpi-assign-${unit.id}`}
              value={assignKpiId || candidates[0]?.id || ''}
              onChange={(e) => setAssignKpiId(e.target.value)}
              disabled={assigning || candidates.length === 0}
              data-testid="unit-kpi-assign-select"
            >
              {candidates.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
              {candidates.length === 0 && <option value="">None left to assign</option>}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`unit-kpi-assign-target-${unit.id}`}>Target (optional)</Label>
            <Input
              id={`unit-kpi-assign-target-${unit.id}`}
              type="number"
              step="any"
              value={assignTarget}
              onChange={(e) => setAssignTarget(e.target.value)}
              disabled={assigning || candidates.length === 0}
              data-testid="unit-kpi-assign-target"
            />
          </div>
          <Button type="submit" isLoading={assigning} disabled={candidates.length === 0} data-testid="unit-kpi-assign-button">
            Assign
          </Button>
          {/* Nothing to pick used to be a dead end: say which KPIs can be assigned, and where one is made. */}
          {kpis.data && candidates.length === 0 && (
            <p className="text-sm text-content-muted sm:col-span-3" data-testid="unit-kpi-none-to-assign">
              Only a KPI whose scope is “Per unit” can be assigned here, and none is left.{' '}
              <Link href={`/kpis/new?scope=PER_UNIT&unit=${unit.id}`} className="font-medium text-accent-primary hover:underline">
                Create one for {unit.name}
              </Link>
            </p>
          )}
          {assignError && (
            <p role="alert" data-testid="unit-kpi-assign-error" className="text-sm text-status-critical sm:col-span-3">
              {assignError}
            </p>
          )}
        </form>
      </CanAssign>
    </div>
  );
}

/** The API asks for both keys: assigning changes what a unit is measured on. */
function CanAssign({ children }: { children: ReactNode }) {
  return (
    <PermissionGuard permission="KPI_CREATE">
      <PermissionGuard permission="GROUPS_MANAGE">{children}</PermissionGuard>
    </PermissionGuard>
  );
}
