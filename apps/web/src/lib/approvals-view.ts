import type { ApprovalEntityType, ApprovalRequest, ApprovalWorkflow } from './collab-client';

/** The three kinds of change that can be put behind an approval, in the order they are listed. */
export const APPROVAL_KINDS: ReadonlyArray<{ entityType: ApprovalEntityType; title: string; one: string; about: string }> = [
  { entityType: 'KPI_DEFINITION', title: 'KPI changes', one: 'KPI change', about: 'Editing a KPI’s name, target, thresholds or settings.' },
  { entityType: 'KPI_TARGET', title: 'KPI targets', one: 'KPI target', about: 'Adding or changing a target for a period.' },
  { entityType: 'ROLE_PERMISSIONS', title: 'Role permissions', one: 'Role permission change', about: 'Changing what a role is allowed to do.' },
];

export interface WorkflowSetting {
  entityType: ApprovalEntityType;
  requiredApproverRoleIds: string[];
  requireAll: boolean;
  isActive: boolean;
}

/**
 * All three kinds, always — a kind nobody has configured yet is shown switched
 * off with no approvers, ready to be set (saving it creates it). A new
 * organisation used to see "No workflows configured" and nothing to press.
 */
export function workflowSettings(saved: readonly ApprovalWorkflow[]): WorkflowSetting[] {
  return APPROVAL_KINDS.map(({ entityType }) => {
    const existing = saved.find((w) => w.entityType === entityType);
    return {
      entityType,
      requiredApproverRoleIds: existing?.requiredApproverRoleIds ?? [],
      requireAll: existing?.requireAll ?? false,
      isActive: existing?.isActive ?? false,
    };
  });
}

/** Tick or untick one approver role. */
export function toggleApproverRole(roleIds: readonly string[], roleId: string): string[] {
  return roleIds.includes(roleId) ? roleIds.filter((id) => id !== roleId) : [...roleIds, roleId];
}

/** Why a workflow cannot be switched on as it stands, or null. */
export function workflowProblem(setting: Pick<WorkflowSetting, 'isActive' | 'requiredApproverRoleIds'>): string | null {
  return setting.isActive && setting.requiredApproverRoleIds.length === 0
    ? 'Choose at least one approver role first — otherwise every change would wait for somebody who does not exist.'
    : null;
}

export function kindLabel(entityType: string): string {
  return APPROVAL_KINDS.find((k) => k.entityType === entityType)?.one ?? entityType;
}

/** What a pending request means for the person looking at it. */
export function requestStanding(request: Pick<ApprovalRequest, 'canDecide' | 'requesterUserId'>, viewerId: string | null): 'decide' | 'mine' | 'watch' {
  if (request.canDecide) return 'decide';
  return viewerId !== null && request.requesterUserId === viewerId ? 'mine' : 'watch';
}

const STATUS_WORDS: Record<string, string> = { PENDING: 'Waiting', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };
export function statusLabel(status: string): string {
  return STATUS_WORDS[status] ?? status;
}
