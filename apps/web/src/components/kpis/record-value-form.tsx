'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { ApiError } from '../../lib/api-client';
import { type Period, currentPeriod, toApiPeriod } from '../../lib/period';
import { useFiscalConfig } from '../../lib/use-fiscal-config';
import { Button, Input, Label } from '../ui';

export interface RecordValueFormProps {
  /** The KPI's frequency, which decides the period offered by default. */
  frequency: string;
  /** The KPI's unit, shown beside the value. */
  unit?: string | null;
  /** Posts the value. Throws to report a failure. */
  onRecord: (body: { value: number; periodStart: string; periodEnd: string; note?: string }) => Promise<unknown>;
  /** Called after a successful record, to reload the list. */
  onRecorded?: () => void;
  /** Prefix for this form's test ids; defaults to the KPI detail Data tab's. */
  testIdPrefix?: string;
  /** Shown above the form, e.g. which unit the value is for. */
  children?: React.ReactNode;
}

/**
 * Record one value against a KPI.
 *
 * The period defaults to the one the KPI's frequency implies — a monthly KPI
 * offers this month — instead of stamping "now" on both ends, and it can be
 * changed. When the API answers 422 SCOPE_MISMATCH it names the endpoint that
 * does fit, so the message says where the value belongs instead of just
 * refusing (UI-003).
 */
export function RecordValueForm({
  frequency,
  unit,
  onRecord,
  onRecorded,
  testIdPrefix = 'data',
  children,
}: RecordValueFormProps) {
  const [value, setValue] = useState('');
  const [period, setPeriod] = useState<Period>(() => currentPeriod(frequency));
  // The organisation's calendar arrives a moment after the form: until the person changes the
  // period themselves, the default follows it (a fiscal quarter, a week starting on their day).
  const fiscal = useFiscalConfig();
  const [periodTouched, setPeriodTouched] = useState(false);
  useEffect(() => {
    if (fiscal.ready && !periodTouched) setPeriod(currentPeriod(frequency, new Date(), fiscal.config));
  }, [fiscal.ready, fiscal.config, frequency, periodTouched]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = Number(value);
    if (value.trim() === '' || Number.isNaN(parsed)) {
      setError('Enter a number to record.');
      return;
    }
    if (period.periodEnd < period.periodStart) {
      setError('The period ends before it starts.');
      return;
    }
    setBusy(true);
    try {
      await onRecord({ ...toApiPeriod(period), value: parsed, note: note.trim() || undefined });
      setValue('');
      setNote('');
      onRecorded?.();
    } catch (err) {
      setError(recordErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" data-testid={`${testIdPrefix}-record-form`}>
      {children}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${testIdPrefix}-value-input`}>Value{unit ? ` (${unit})` : ''}</Label>
        <Input
          id={`${testIdPrefix}-value-input`}
          type="number"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid={`${testIdPrefix}-value`}
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${testIdPrefix}-period-start`}>Period from</Label>
        <Input
          id={`${testIdPrefix}-period-start`}
          type="date"
          value={period.periodStart}
          onChange={(e) => {
            setPeriodTouched(true);
            setPeriod((p) => ({ ...p, periodStart: e.target.value }));
          }}
          data-testid={`${testIdPrefix}-period-start`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${testIdPrefix}-period-end`}>to</Label>
        <Input
          id={`${testIdPrefix}-period-end`}
          type="date"
          value={period.periodEnd}
          onChange={(e) => {
            setPeriodTouched(true);
            setPeriod((p) => ({ ...p, periodEnd: e.target.value }));
          }}
          data-testid={`${testIdPrefix}-period-end`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${testIdPrefix}-note`}>Note (optional)</Label>
        <Input
          id={`${testIdPrefix}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid={`${testIdPrefix}-note`}
          className="w-56"
        />
      </div>
      <Button type="submit" isLoading={busy} data-testid={`${testIdPrefix}-record`}>
        Record
      </Button>
      {error && (
        <p role="alert" data-testid={`${testIdPrefix}-error`} className="w-full text-sm text-status-critical">
          {error}
        </p>
      )}
    </form>
  );
}

/** The sentence shown when a value cannot be recorded. */
export function recordErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const details = err.details as { correctEndpoint?: string } | undefined;
    if (err.code === 'SCOPE_MISMATCH' && details?.correctEndpoint) {
      return `${err.message} Record it through ${details.correctEndpoint}.`;
    }
    return err.message;
  }
  return err instanceof Error && err.message ? err.message : 'Could not record that value.';
}
