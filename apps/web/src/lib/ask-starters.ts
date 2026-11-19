/**
 * The example questions on an empty Ask page.
 *
 * They were fixed text — "Forecast MRR for next 3 months", "Compare CAC across
 * org units" — whatever the organisation measures. They now name its own KPIs
 * (the first two it can see, by name), so pressing one asks about something
 * that exists.
 */
export function starterQuestions(kpiNames: readonly string[]): string[] {
  const names = [...new Set(kpiNames.map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const first = 'Which KPIs are off track this quarter?';
  if (names.length === 0) return [first, 'What changed most this month?', 'Where should I focus next?'];
  if (names.length === 1) return [first, `How is ${names[0]} doing?`, 'Where should I focus next?'];
  return [first, `How is ${names[0]} doing?`, `What is the trend in ${names[1]} over the last 3 months?`];
}
