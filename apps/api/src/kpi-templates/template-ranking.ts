/**
 * Pure in-memory relevance ranking for KPI templates. Kept free of Prisma/Nest
 * so the scoring + filtering can be unit-tested in isolation. PG full-text
 * search (tsvector + GIN) is deferred to P9 — in-memory ranking is sufficient
 * at FYP scale.
 */

/** The subset of a template the ranker needs. */
export interface RankableTemplate {
  name: string;
  description?: string | null;
  tags: string[];
  popularity: number;
  function?: string | null;
  industry?: string | null;
  scorecardQuadrant?: string | null;
}

export interface TemplateFilters {
  industry?: string;
  function?: string;
  scorecardQuadrant?: string;
  search?: string;
}

// Relevance weights (highest-priority signal wins; see plan Module 3).
const SCORE_NAME_EXACT = 1000;
const SCORE_NAME_PREFIX = 500;
const SCORE_NAME_CONTAINS = 200;
const SCORE_TAG_EXACT = 150;
const SCORE_TAG_PREFIX = 75;
const SCORE_DESC_CONTAINS = 50;
const POPULARITY_CAP = 25;

/**
 * Relevance of a single template against a search term. Takes the best (highest)
 * matching signal across name → tags → description; returns 0 when nothing
 * matches. Case-insensitive. An empty/blank search yields 0 (no textual signal).
 */
export function scoreTemplate(template: RankableTemplate, search: string): number {
  const q = search.trim().toLowerCase();
  if (q === '') return 0;

  const name = template.name.toLowerCase();
  if (name === q) return SCORE_NAME_EXACT;
  if (name.startsWith(q)) return SCORE_NAME_PREFIX;
  if (name.includes(q)) return SCORE_NAME_CONTAINS;

  const tags = template.tags.map((t) => t.toLowerCase());
  if (tags.some((t) => t === q)) return SCORE_TAG_EXACT;
  if (tags.some((t) => t.startsWith(q))) return SCORE_TAG_PREFIX;

  if ((template.description ?? '').toLowerCase().includes(q)) return SCORE_DESC_CONTAINS;

  return 0;
}

/** Popularity contribution, capped so it only ever breaks ties within a tier. */
export function popularityBonus(popularity: number): number {
  return Math.min(Math.max(popularity, 0), POPULARITY_CAP);
}

/**
 * Filters by exact industry/function/quadrant (when supplied), then ranks.
 * With a search term, templates with no textual match are dropped and the rest
 * are ordered by relevance (popularity breaking ties). Without a search term,
 * all filtered templates are returned ordered by popularity desc, then name.
 */
export function rankTemplates<T extends RankableTemplate>(
  templates: T[],
  filters: TemplateFilters,
): T[] {
  const eq = (a: string | null | undefined, b: string) => (a ?? '').toLowerCase() === b.toLowerCase();

  let pool = templates;
  if (filters.industry) pool = pool.filter((t) => eq(t.industry, filters.industry!));
  if (filters.function) pool = pool.filter((t) => eq(t.function, filters.function!));
  if (filters.scorecardQuadrant) pool = pool.filter((t) => eq(t.scorecardQuadrant, filters.scorecardQuadrant!));

  const search = (filters.search ?? '').trim();
  if (search === '') {
    return [...pool].sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
  }

  return pool
    .map((t) => {
      const relevance = scoreTemplate(t, search);
      // Popularity only breaks ties among genuine matches — a popular template
      // with no textual hit must not survive the filter below.
      return { t, score: relevance > 0 ? relevance + popularityBonus(t.popularity) : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
    .map((x) => x.t);
}
