/**
 * Pure scorer for the NLQ golden-question harness. Each answer is graded on 3
 * subchecks; a question passes when at least 2 hold. Kept free of Nest/HTTP so
 * the grading logic is unit-testable and the live harness just feeds it answers.
 */

export interface GoldenQuestion {
  question: string;
  /** The answer should mention at least one of these (case-insensitive). */
  expectKeywords: string[];
  /** The sources should include a KPI whose name contains one of these. */
  expectKpiNames: string[];
}

export interface NlqResponse {
  answer: string;
  sources: Array<{ kpiId: string; name: string }>;
}

export interface ScoreResult {
  subchecks: { keyword: boolean; source: boolean; nonEmpty: boolean };
  passed: boolean;
}

const lc = (s: string): string => s.toLowerCase();

export function scoreAnswer(res: NlqResponse, golden: GoldenQuestion): ScoreResult {
  const answer = res.answer ?? '';
  const nonEmpty = answer.trim().length > 0;

  const keyword = golden.expectKeywords.some((k) => lc(answer).includes(lc(k)));

  const sourceNames = res.sources.map((s) => lc(s.name));
  const source = golden.expectKpiNames.some((name) => sourceNames.some((sn) => sn.includes(lc(name))));

  const passed = [keyword, source, nonEmpty].filter(Boolean).length >= 2;
  return { subchecks: { keyword, source, nonEmpty }, passed };
}

/** Aggregate pass rate over a set of scored questions. */
export function scoreRate(results: ScoreResult[]): { passed: number; total: number; rate: number } {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  return { passed, total, rate: total === 0 ? 0 : passed / total };
}
