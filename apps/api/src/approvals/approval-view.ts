/**
 * What a person reading the approvals inbox needs beside the raw request: who
 * asked, what it is about, and whether *they* can decide it. Pure, so the
 * rules can be tested without a database.
 */
export interface ApprovalViewer {
  userId: string;
  roleId: string | null;
}

export interface DecidableRequest {
  status: string;
  requesterUserId: string;
  workflowId: string;
  decisions: unknown;
}

/**
 * Whether this viewer may approve or reject this request — the same rules
 * `decide` enforces, so the page offers the buttons exactly when pressing them
 * would work (UI-008: they were shown to everyone, the requester included).
 */
export function canDecide(
  request: DecidableRequest,
  viewer: ApprovalViewer,
  approverRoleIds: readonly string[] | undefined,
): boolean {
  if (request.status !== 'PENDING') return false;
  if (request.requesterUserId === viewer.userId) return false;
  if (!viewer.roleId || !approverRoleIds?.includes(viewer.roleId)) return false;
  const decisions = Array.isArray(request.decisions) ? (request.decisions as Array<{ userId?: unknown }>) : [];
  return !decisions.some((d) => d.userId === viewer.userId);
}

/** Which KPI a KPI_TARGET request is about: named in the payload for a new target, else the entity itself. */
export function targetKpiId(request: { entityId: string; proposedPayload: unknown }): string {
  const kpiId = (request.proposedPayload as { kpiId?: unknown } | null)?.kpiId;
  return typeof kpiId === 'string' && kpiId ? kpiId : request.entityId;
}
