/**
 * Pure relevance scoring for global search: exact 1.0 / prefix 0.8 / substring
 * 0.5 / none 0. Case-insensitive, trimmed.
 */
export function scoreMatch(text: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (t === q) return 1.0;
  if (t.startsWith(q)) return 0.8;
  if (t.includes(q)) return 0.5;
  return 0;
}
