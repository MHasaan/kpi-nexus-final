import { DEFAULT_FORMAT_SETTINGS, type FormatSettings, formatDateTime, formatNumber } from '@kpi-nexus/contracts';

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
export function latestValueLine(kpi: { latestValue: number | null; unit: string | null }, format: FormatSettings | undefined): string {
  if (kpi.latestValue === null) return 'Latest value: No data';
  const number = formatNumber(kpi.latestValue, format ?? DEFAULT_FORMAT_SETTINGS);
  return `Latest value: ${number}${kpi.unit ? ` ${kpi.unit}` : ''}`;
}
