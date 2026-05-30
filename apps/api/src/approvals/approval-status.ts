/**
 * Pure approval-resolution logic for ApprovalRequest. Given the workflow mode
 * and the decisions collected so far, decide whether the request is resolved.
 *
 * - Any rejection short-circuits to REJECTED (single-level workflow).
 * - requireAll: APPROVED once every required approver has approved (distinct).
 * - single-approver (default): APPROVED on the first approval.
 */
export type ApprovalDecisionKind = 'approve' | 'reject';

export interface ApprovalDecision {
  userId: string;
  decision: ApprovalDecisionKind;
}

export interface ResolveStatusInput {
  requireAll: boolean;
  requiredApproverCount: number;
  decisions: readonly ApprovalDecision[];
}

export type ResolvedApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export function resolveStatus(input: ResolveStatusInput): ResolvedApprovalStatus {
  const { requireAll, requiredApproverCount, decisions } = input;

  if (decisions.some((d) => d.decision === 'reject')) return 'REJECTED';

  const distinctApprovers = new Set(decisions.filter((d) => d.decision === 'approve').map((d) => d.userId));

  if (requireAll) {
    return distinctApprovers.size >= Math.max(1, requiredApproverCount) ? 'APPROVED' : 'PENDING';
  }

  return distinctApprovers.size >= 1 ? 'APPROVED' : 'PENDING';
}
