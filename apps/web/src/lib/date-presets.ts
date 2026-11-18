import { DEFAULT_FISCAL_CONFIG, type FiscalConfig, fiscalQuarterRange, fiscalYearRange } from '@kpi-nexus/contracts';

/** The ranges a dashboard offers without typing dates. */
export type RangePreset = '7d' | '30d' | '90d' | '1y' | 'quarter' | 'fiscal-year';

const DAYS: Record<'7d' | '30d' | '90d' | '1y', number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

/**
 * The dates a preset stands for, as YYYY-MM-DD. "This quarter" and "This
 * fiscal year" start where the organisation's calendar says they do and end
 * today — there are no values after today to show.
 */
export function presetToRange(preset: RangePreset, now: Date = new Date(), fiscal: FiscalConfig = DEFAULT_FISCAL_CONFIG): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  if (preset === 'quarter') return { from: fiscalQuarterRange(now, fiscal.startMonth).periodStart, to };
  if (preset === 'fiscal-year') return { from: fiscalYearRange(now, fiscal.startMonth).periodStart, to };
  return { from: new Date(now.getTime() - DAYS[preset] * 86_400_000).toISOString().slice(0, 10), to };
}
