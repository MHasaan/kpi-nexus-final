import type { DraftProblem, DraftSection } from '@kpi-nexus/contracts';

/** The problems on one row of a section (optionally one field of it). */
export function rowProblems(problems: readonly DraftProblem[], section: DraftSection, index: number, field?: string): DraftProblem[] {
  return problems.filter((p) => p.section === section && p.index === index && (field === undefined || p.field === field));
}

/** What is wrong with one row, said under it. Nothing when nothing is. */
export function RowProblems({
  problems,
  section,
  index,
  testId,
}: {
  problems: readonly DraftProblem[];
  section: DraftSection;
  index: number;
  testId: string;
}) {
  const mine = rowProblems(problems, section, index);
  if (mine.length === 0) return null;
  return (
    <p role="alert" data-testid={testId} className="mt-1 text-xs text-status-critical">
      {mine.map((p) => p.message).join(' ')}
    </p>
  );
}
