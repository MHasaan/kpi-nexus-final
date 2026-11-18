/**
 * An organisation's label, as it reads in the middle of a sentence:
 * "Dashboard" becomes "dashboard", but an acronym keeps its capitals — "KPI"
 * stays "KPI", "OKRs" stays "OKRs". Lowercasing everything turned page text
 * into "your kpi data" and "Search kpis…" (QA-L16).
 */
export function inSentence(label: string): string {
  return label
    .split(/(\s+)/)
    .map((word) => (isAcronym(word) ? word : word.toLowerCase()))
    .join('');
}

/** Two or more capitals, optionally followed by a plural "s" or "es": KPI, KPIs, OKR, SLAs. */
function isAcronym(word: string): boolean {
  return /^[A-Z]{2,}(?:e?s)?$/.test(word);
}
