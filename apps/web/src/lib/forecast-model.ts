/** Forecast models in words, and what to say when the one that ran is not the one that was asked for. */

export const FORECAST_MODELS = [
  { value: 'naive', label: 'Simple trend', about: 'A straight line through the recent values. Works with very little history.' },
  { value: 'prophet', label: 'Prophet', about: 'Trend plus seasonality. Needs a longer, evenly spaced history.' },
  { value: 'arima', label: 'ARIMA', about: 'Learns from how each value follows the ones before it. Needs a longer history.' },
] as const;

export function forecastModelLabel(model: string): string {
  return FORECAST_MODELS.find((m) => m.value === model.toLowerCase())?.label ?? model;
}

/**
 * What to tell the reader when the forecast was made by a different model
 * than the one chosen, or null when it was the one chosen. The service falls
 * back to the simple trend when the chosen model cannot be fitted — and used
 * to say so only by a small "NAIVE" in a metric card (QA-M9).
 */
export function forecastFallbackNotice(requested: string, ran: string): string | null {
  if (requested.toLowerCase() === ran.toLowerCase()) return null;
  return `${forecastModelLabel(requested)} could not be fitted to this KPI's values — usually because there are too few of them or they are unevenly spaced. This forecast was made with ${forecastModelLabel(ran)} instead.`;
}
