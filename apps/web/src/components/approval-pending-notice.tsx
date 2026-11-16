import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shown when the API answered 202 `APPROVAL_REQUIRED`: the change was queued
 * behind an approval workflow instead of being applied (UI-011).
 */
export function ApprovalPendingNotice({
  what,
  plural = false,
  testId,
  children,
}: {
  /** What was submitted, e.g. "Your changes to this KPI". */
  what: string;
  /** "were" instead of "was". */
  plural?: boolean;
  testId: string;
  /** Extra links, e.g. back to the KPI. */
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      data-testid={testId}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-primary/30 bg-accent-bg px-4 py-3 text-sm text-content-strong"
    >
      <span>{what} {plural ? 'were' : 'was'} sent for approval. Nothing changes until an approver accepts.</span>
      <span className="flex items-center gap-4">
        {children}
        <Link href="/approvals" className="font-semibold text-accent-primary hover:underline">
          View approvals
        </Link>
      </span>
    </div>
  );
}
