/**
 * What an approval request asks for, as rows an approver can read.
 *
 * A request is stored as the body that will be applied if it is approved: for a
 * target `{ kind, kpiId | targetId, dto }`, for a KPI or a role the fields being
 * changed. Beside it is the thing as it was when the request was made (absent
 * for something new). Shown as stored, a new target read `dto: {"type":"STATIC",
 * "value":2.5}`, and a change listed every field the thing has as changed to
 * nothing. Here: only the fields that change, named in words, from and to.
 */
import { DIRECTION_LABELS, FREQUENCY_LABELS, KPI_STATUS_LABELS, KPI_TYPE_LABELS, QUADRANT_LABELS, SCOPE_LABELS, humanize } from './labels';
import { permissionLabel } from './permissions';

export interface ChangeRow {
  label: string;
  /** What it is now. Absent for something new, and for the lists of what is added or taken away. */
  before?: string;
  after: string;
}

export interface ChangeFormat {
  number?: (value: number) => string;
  /** Given the stored ISO date-time. */
  date?: (iso: string) => string;
}

const FIELD_LABELS: Record<string, string> = {
  value: 'Target',
  targetValue: 'Target',
  minValue: 'Minimum',
  expectedValue: 'Expected',
  stretchValue: 'Stretch',
  effectiveFrom: 'Applies from',
  effectiveTo: 'Until',
  isAdmin: 'Full administrator access',
  scorecardQuadrant: 'Scorecard area',
};

/** Words for the stored codes of the fields that hold one. */
const VALUE_LABELS: Record<string, Readonly<Record<string, string>>> = {
  direction: DIRECTION_LABELS,
  frequency: FREQUENCY_LABELS,
  status: KPI_STATUS_LABELS,
  scope: SCOPE_LABELS,
  scorecardQuadrant: QUADRANT_LABELS,
};

/** Fields a person types: "USD" there is what they wrote, not a code to put into words. */
const FREE_TEXT = new Set(['name', 'unit', 'description', 'formula', 'scenarioName', 'color']);

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/;
const CODE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A field that names a record rather than describing the change: `kpiId`, `targetId`, `id`. */
const isReference = (key: string): boolean => key === 'id' || key === 'kind' || /Id$/.test(key);

function show(key: string, value: unknown, format: ChangeFormat): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return format.number ? format.number(value) : String(value);
  if (typeof value === 'string') {
    if (ISO_DATE_TIME.test(value)) return format.date ? format.date(value) : value.slice(0, 10);
    if (key === 'permissions') return permissionLabel(value);
    const known = VALUE_LABELS[key]?.[value] ?? (key === 'type' ? KPI_TYPE_LABELS[value] : undefined);
    if (known) return known;
    return CODE.test(value) && !FREE_TEXT.has(key) ? humanize(value) : value;
  }
  if (Array.isArray(value)) return value.length === 0 ? 'None' : value.map((item) => show(key, item, format)).join(', ');
  return JSON.stringify(value);
}

const isListOfWords = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export function approvalChanges(proposed: unknown, current: unknown, format: ChangeFormat = {}): ChangeRow[] {
  const request = asRecord(proposed);
  if (!request) return [];
  // A target's request wraps the fields; a KPI's or a role's is the fields.
  const fields = typeof request.kind === 'string' && asRecord(request.dto) ? asRecord(request.dto)! : request;
  const was = asRecord(current);

  const rows: ChangeRow[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (isReference(key) || value === undefined) continue;
    const label = FIELD_LABELS[key] ?? humanize(key);

    if (!was) {
      // Something new: a plain target's kind ("a fixed value") is not news.
      if (key === 'type' && value === 'STATIC') continue;
      if (value === null) continue;
      rows.push({ label, after: show(key, value, format) });
      continue;
    }

    const before = was[key];
    if (same(before, value)) continue;
    if (isListOfWords(value) && isListOfWords(before)) {
      const added = value.filter((item) => !before.includes(item));
      const removed = before.filter((item) => !value.includes(item));
      if (added.length > 0) rows.push({ label: `${label} added`, after: show(key, added, format) });
      if (removed.length > 0) rows.push({ label: `${label} taken away`, after: show(key, removed, format) });
      continue;
    }
    rows.push({ label, before: show(key, before, format), after: show(key, value, format) });
  }
  return rows;
}
