import { DEFAULT_FORMAT_SETTINGS, type FormatSettings, type KpiHolders, formatDateTime, formatNumber, holdersText } from '@kpi-nexus/contracts';

/**
 * The words a report file prints. Kept apart from the PDF drawing so they can
 * be tested, and so every file format says the same thing the same way.
 */

/** "Generated: <date and time> (<timezone>)" — the moment in the organisation's timezone, which it names. */
export function generatedLine(generatedAt: Date, format: FormatSettings | undefined): string {
  const settings = format ?? DEFAULT_FORMAT_SETTINGS;
  return `Generated: ${formatDateTime(generatedAt, settings)} (${settings.timezone})`;
}

/** "Latest value: <number> <unit>", the number written the organisation's way. */
export function latestValueLine(
  kpi: { latestValue: number | null; unit: string | null; holders?: KpiHolders | null; scope?: string },
  format: FormatSettings | undefined,
): string {
  // A per-person or per-unit KPI with several holders has no one value (UI-018).
  if (kpi.holders) return holdersText(kpi.holders, kpi.scope ?? 'PER_USER');
  if (kpi.latestValue === null) return 'Latest value: No data';
  const number = formatNumber(kpi.latestValue, format ?? DEFAULT_FORMAT_SETTINGS);
  return `Latest value: ${number}${kpi.unit ? ` ${kpi.unit}` : ''}`;
}

type Measured = { targetValue?: number | null; unit: string | null };

/** "Target: <number> <unit>", or that none is set. */
export function targetLine(kpi: Measured, format: FormatSettings | undefined): string {
  if (kpi.targetValue == null) return 'Target: none set';
  return `Target: ${withUnit(kpi.targetValue, kpi.unit, format)}`;
}

/** "92% of target", or a dash when there is no target or no value to compare. */
export function attainmentText(pct: number | null | undefined): string {
  return pct == null ? '—' : `${Math.round(pct)}% of target`;
}

const STATUS_LABELS: Record<string, string> = {
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  OFF_TRACK: 'Off track',
  NO_TARGET: 'No target',
  NO_DATA: 'No data',
};

/** A health status in words, as the pages say it. */
export function statusLabel(status: string | undefined): string {
  return status ? (STATUS_LABELS[status] ?? status) : '—';
}

type SummaryKpi = Measured & {
  name: string;
  latestValue: number | null;
  attainmentPct?: number | null;
  status?: string;
  holders?: KpiHolders | null;
  scope?: string;
};

/** One row of the first page's table: name, latest value, target, attainment, status. */
export function summaryRow(kpi: SummaryKpi, format: FormatSettings | undefined): [string, string, string, string, string] {
  return [
    kpi.name,
    kpi.holders ? holdersText(kpi.holders, kpi.scope ?? 'PER_USER') : kpi.latestValue === null ? 'No data' : withUnit(kpi.latestValue, kpi.unit, format),
    kpi.targetValue == null ? '—' : withUnit(kpi.targetValue, kpi.unit, format),
    kpi.attainmentPct == null ? '—' : `${Math.round(kpi.attainmentPct)}%`,
    statusLabel(kpi.status),
  ];
}

/** "37 KPIs: 20 on track, 5 at risk, …" — only the statuses that occur. */
export function statusCountsLine(kpis: Array<{ status?: string }>): string {
  if (kpis.length === 0) return 'No KPIs';
  const parts: Array<[string, string]> = [
    ['ON_TRACK', 'on track'],
    ['AT_RISK', 'at risk'],
    ['OFF_TRACK', 'off track'],
    ['NO_TARGET', 'without a target'],
    ['NO_DATA', 'with no data'],
  ];
  const counted = parts
    .map(([status, words]) => [kpis.filter((k) => k.status === status).length, words] as const)
    .filter(([n]) => n > 0)
    .map(([n, words]) => `${n} ${words}`);
  const head = `${kpis.length} KPI${kpis.length === 1 ? '' : 's'}`;
  return counted.length > 0 ? `${head}: ${counted.join(', ')}` : head;
}

function withUnit(value: number, unit: string | null, format: FormatSettings | undefined): string {
  const number = formatNumber(value, format ?? DEFAULT_FORMAT_SETTINGS);
  return `${number}${unit ? ` ${unit}` : ''}`;
}
