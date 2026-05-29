/**
 * Pure parser for the AI's recommendation JSON. Kept free of Nest/Prisma so the
 * fence-stripping, normalization, and fallback logic is unit-testable. The model
 * sometimes wraps JSON in fences or returns prose; on a parse failure we fall
 * back to using the raw text as the summary (never throws).
 */

export type Priority = 'P1' | 'P2' | 'P3';

export interface SuggestedAction {
  action: string;
  rationale: string;
  priority: Priority;
}

export interface RecommendationContent {
  summary: string;
  rootCauseHypotheses: string[];
  suggestedActions: SuggestedAction[];
  confidence: number;
}

const DEFAULT_CONFIDENCE = 0.3;

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fence ? fence[1]!.trim() : trimmed;
}

/** Map P1|P2|P3, 1|2|3, or high/medium/low onto a canonical priority. */
function normalizePriority(p: unknown): Priority {
  if (typeof p === 'string') {
    const u = p.trim().toUpperCase();
    if (u === 'P1' || u === 'P2' || u === 'P3') return u as Priority;
    if (u === 'HIGH' || u === '1') return 'P1';
    if (u === 'MEDIUM' || u === 'MED' || u === '2') return 'P2';
    if (u === 'LOW' || u === '3') return 'P3';
  }
  if (p === 1) return 'P1';
  if (p === 2) return 'P2';
  if (p === 3) return 'P3';
  return 'P2';
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function normalizeActions(raw: unknown): SuggestedAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null && isStr((a as { action?: unknown }).action))
    .map((a) => ({
      action: (a.action as string).trim(),
      rationale: isStr(a.rationale) ? a.rationale.trim() : '',
      priority: normalizePriority(a.priority),
    }));
}

function clampConfidence(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_CONFIDENCE;
  return Math.min(1, Math.max(0, v));
}

export function parseRecommendation(raw: string): RecommendationContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    // Fallback: use the model's prose as the summary.
    return {
      summary: raw.trim().slice(0, 2000),
      rootCauseHypotheses: [],
      suggestedActions: [],
      confidence: DEFAULT_CONFIDENCE,
    };
  }
  const obj = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  return {
    summary: isStr(obj.summary) ? obj.summary.trim() : raw.trim().slice(0, 2000),
    rootCauseHypotheses: Array.isArray(obj.rootCauseHypotheses)
      ? obj.rootCauseHypotheses.filter(isStr).map((s) => s.trim())
      : [],
    suggestedActions: normalizeActions(obj.suggestedActions),
    confidence: clampConfidence(obj.confidence),
  };
}
