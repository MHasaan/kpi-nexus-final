'use client';

import { useMemo, useState } from 'react';

import { useFormat } from '../../lib/format-context';
import { FREQUENCY_LABELS, labelFor } from '../../lib/labels';
import { type PastValueRow, parsePastValues } from '../../lib/past-values';
import { toApiPeriod } from '../../lib/period';
import { useFiscalConfig } from '../../lib/use-fiscal-config';
import { Badge, Button, Label, Textarea } from '../ui';
import { recordErrorMessage } from './record-value-form';

export interface PastValuesFormProps {
  frequency: string;
  unit?: string | null;
  /** The starts ("2026-03-01") of the periods that already have a value, for the same unit or person. */
  existingStarts: ReadonlySet<string>;
  /** Records one value, exactly as the one-value form does. Throws to report a failure. */
  onRecord: (body: { value: number; periodStart: string; periodEnd: string }) => Promise<unknown>;
  onRecorded?: () => void;
}

const STATUS: Record<PastValueRow['status'], { tone: 'success' | 'neutral' | 'warning' | 'error'; text: string }> = {
  ready: { tone: 'success', text: 'Ready' },
  recorded: { tone: 'neutral', text: 'Already recorded — left as it is' },
  repeated: { tone: 'warning', text: 'Same period as an earlier line — left out' },
  invalid: { tone: 'error', text: '' },
};

/**
 * Several past values at once, pasted from a spreadsheet or typed out. A new
 * organisation's first job is entering the months it already has; the only way
 * used to be one value at a time. What each line becomes is shown before
 * anything is saved, and each value is recorded through the same route as the
 * one-value form, so every rule that applies there applies here.
 */
export function PastValuesForm({ frequency, unit, existingStarts, onRecord, onRecorded }: PastValuesFormProps) {
  const fmt = useFormat();
  const fiscal = useFiscalConfig();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ recorded: number; failed: Array<{ line: number; message: string }> } | null>(null);

  const rows = useMemo(() => parsePastValues(text, frequency, existingStarts, fiscal.config), [text, frequency, existingStarts, fiscal.config]);
  const ready = rows.filter((r) => r.status === 'ready');
  const every = labelFor(FREQUENCY_LABELS, frequency).toLowerCase();

  const record = async () => {
    setBusy(true);
    setOutcome(null);
    let recorded = 0;
    const failed: Array<{ line: number; message: string }> = [];
    // One at a time, in order: each is an ordinary recorded value, with its own checks.
    for (const row of ready) {
      try {
        await onRecord({ ...toApiPeriod(row.period!), value: row.value! });
        recorded += 1;
      } catch (err) {
        failed.push({ line: row.line, message: recordErrorMessage(err) });
      }
    }
    setOutcome({ recorded, failed });
    // What is left to look at: the lines that failed.
    const failedLines = new Set(failed.map((f) => f.line));
    setText(rows.filter((r) => failedLines.has(r.line)).map((r) => r.text).join('\n'));
    setBusy(false);
    if (recorded > 0) onRecorded?.();
  };

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setOpen(true)} data-testid="past-values-open">
        Paste past values
      </Button>
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border-divider pt-4" data-testid="past-values-form">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="past-values-input">Past values{unit ? ` (${unit})` : ''}</Label>
        <Textarea
          id="past-values-input"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOutcome(null);
          }}
          rows={6}
          placeholder={'2026-01, 42000\n2026-02, 39500\n2026-03, 45100'}
          className="font-mono text-xs"
          data-testid="past-values-input"
        />
        <p className="text-xs text-content-muted">
          One value a line: a date, then the value — or paste two columns from a spreadsheet. Each value counts for the
          whole period its date falls in (this KPI is {every}). Use a point for decimals.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="divide-y divide-border-divider rounded-md border border-border text-xs" data-testid="past-values-preview">
          {rows.map((row) => (
            <li key={row.line} data-testid="past-value-row" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
              <span className="w-12 tabular-nums text-content-muted">Line {row.line}</span>
              <span className="min-w-[11rem] tabular-nums text-content">
                {row.period ? (row.period.periodStart === row.period.periodEnd ? fmt.day(row.period.periodStart) : `${fmt.day(row.period.periodStart)} – ${fmt.day(row.period.periodEnd)}`) : row.text}
              </span>
              <span className="min-w-[6rem] text-right tabular-nums text-content-strong">{row.value !== null ? fmt.number(row.value) : ''}</span>
              <Badge tone={STATUS[row.status].tone}>{row.status === 'invalid' ? row.problem : STATUS[row.status].text}</Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void record()} disabled={busy || ready.length === 0} isLoading={busy} data-testid="past-values-record">
          {ready.length === 1 ? 'Record 1 value' : `Record ${ready.length} values`}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Close
        </Button>
      </div>

      {outcome && (
        <div role="status" className="space-y-1 text-sm">
          <p data-testid="past-values-outcome" className={outcome.failed.length ? 'text-status-warning' : 'text-status-success'}>
            {outcome.recorded === 1 ? 'Recorded 1 value.' : `Recorded ${outcome.recorded} values.`}
            {outcome.failed.length > 0 && ` ${outcome.failed.length} could not be recorded; they are left in the box.`}
          </p>
          {outcome.failed.map((f) => (
            <p key={f.line} className="text-xs text-status-critical">
              Line {f.line}: {f.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
