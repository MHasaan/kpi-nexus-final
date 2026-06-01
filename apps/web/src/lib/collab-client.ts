/**
 * P7 collaboration API helpers (tasks, comments, mentions, OKRs, approvals,
 * workflows). Thin typed wrappers over the shared `api()` fetch client.
 */
import { api } from './api-client';

// --- Tasks ---

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  kpiId: string | null;
  assigneeUserId: string | null;
  dueAt: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdById: string;
  createdAt: string;
}

export function listTasks(params: { status?: TaskStatus; priority?: TaskPriority; assigneeUserId?: string } = {}): Promise<Task[]> {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return api(`/tasks${q ? `?${q}` : ''}`);
}
export function createTask(body: Partial<Task>): Promise<Task> {
  return api('/tasks', { method: 'POST', body: JSON.stringify(body) });
}
export function updateTask(id: string, body: Partial<Task>): Promise<Task> {
  return api(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export function deleteTask(id: string): Promise<void> {
  return api(`/tasks/${id}`, { method: 'DELETE' });
}

// --- Comments + mentions ---

export type CommentEntityType = 'kpi' | 'dashboard' | 'alert' | 'task' | 'objective';

export interface Comment {
  id: string;
  entityType: CommentEntityType;
  entityId: string;
  authorId: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: string;
}

export function listComments(entityType: CommentEntityType, entityId: string): Promise<Comment[]> {
  return api(`/comments?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`);
}
export function createComment(body: {
  entityType: CommentEntityType;
  entityId: string;
  body: string;
  mentionedUserIds?: string[];
}): Promise<Comment> {
  return api('/comments', { method: 'POST', body: JSON.stringify(body) });
}

export interface Mention {
  id: string;
  commentId: string;
  mentionedUserId: string;
  readAt: string | null;
  createdAt: string;
}
export function listMentions(unreadOnly = false): Promise<Mention[]> {
  return api(`/me/mentions${unreadOnly ? '?unreadOnly=true' : ''}`);
}
export function mentionUnreadCount(): Promise<{ count: number }> {
  return api('/me/mentions/unread-count');
}
export function markMentionRead(id: string): Promise<Mention> {
  return api(`/me/mentions/${id}/read`, { method: 'POST' });
}
export function markAllMentionsRead(): Promise<{ count: number }> {
  return api('/me/mentions/read-all', { method: 'POST' });
}

// --- OKRs ---

export type ObjectiveStatus = 'DRAFT' | 'ACTIVE' | 'AT_RISK' | 'ACHIEVED' | 'MISSED' | 'ARCHIVED';

export interface Objective {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  parentObjectiveId: string | null;
  periodStart: string;
  periodEnd: string;
  status: ObjectiveStatus;
  progress: number;
}
export interface KeyResult {
  id: string;
  objectiveId: string;
  name: string;
  kpiId: string | null;
  baselineValue: number | null;
  targetValue: number;
  currentValue: number | null;
  weight: number;
  progress: number;
}

export function listObjectives(): Promise<Objective[]> {
  return api('/objectives');
}
export function getObjective(id: string): Promise<Objective> {
  return api(`/objectives/${id}`);
}
export function createObjective(body: {
  name: string;
  description?: string;
  ownerUserId: string;
  parentObjectiveId?: string;
  periodStart: string;
  periodEnd: string;
  status?: ObjectiveStatus;
}): Promise<Objective> {
  return api('/objectives', { method: 'POST', body: JSON.stringify(body) });
}
export function listKeyResults(objectiveId: string): Promise<KeyResult[]> {
  return api(`/objectives/${objectiveId}/key-results`);
}
export function createKeyResult(objectiveId: string, body: {
  name: string;
  kpiId?: string;
  baselineValue?: number;
  targetValue: number;
  currentValue?: number;
  weight?: number;
}): Promise<KeyResult> {
  return api(`/objectives/${objectiveId}/key-results`, { method: 'POST', body: JSON.stringify(body) });
}
export function updateKeyResult(objectiveId: string, krId: string, body: Partial<KeyResult>): Promise<KeyResult> {
  return api(`/objectives/${objectiveId}/key-results/${krId}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export function syncObjectiveFromKpis(id: string): Promise<Objective> {
  return api(`/objectives/${id}/sync-from-linked-kpis`, { method: 'POST' });
}

// --- Approvals ---

export type ApprovalEntityType = 'KPI_DEFINITION' | 'KPI_TARGET' | 'ROLE_PERMISSIONS';
export type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ApprovalWorkflow {
  id: string;
  entityType: ApprovalEntityType;
  requiredApproverRoleIds: string[];
  requireAll: boolean;
  isActive: boolean;
}
export interface ApprovalRequest {
  id: string;
  workflowId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  requesterUserId: string;
  proposedPayload: unknown;
  /** Entity state BEFORE the proposed change (null for creates) — for before→after diffs. */
  currentPayload?: unknown;
  status: ApprovalRequestStatus;
  decisions: Array<{ userId: string; decision: string; comment?: string; decidedAt: string }>;
  createdAt: string;
}

export function listApprovalWorkflows(): Promise<ApprovalWorkflow[]> {
  return api('/approvals/workflows');
}
export function upsertApprovalWorkflow(entityType: ApprovalEntityType, body: {
  requiredApproverRoleIds: string[];
  requireAll?: boolean;
  isActive?: boolean;
}): Promise<ApprovalWorkflow> {
  return api(`/approvals/workflows/${entityType}`, { method: 'PUT', body: JSON.stringify(body) });
}
export function listApprovalRequests(params: { status?: ApprovalRequestStatus } = {}): Promise<ApprovalRequest[]> {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return api(`/approvals/requests${q ? `?${q}` : ''}`);
}
export function decideApprovalRequest(id: string, body: { decision: 'approve' | 'reject'; comment?: string }): Promise<ApprovalRequest> {
  return api(`/approvals/requests/${id}/decide`, { method: 'POST', body: JSON.stringify(body) });
}
export function cancelApprovalRequest(id: string): Promise<ApprovalRequest> {
  return api(`/approvals/requests/${id}/cancel`, { method: 'POST' });
}

// --- Workflows (rule engine) ---

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  triggers: string[];
  rule: unknown;
  action: unknown;
  isActive: boolean;
  lastRunAt: string | null;
}
export function listWorkflows(): Promise<Workflow[]> {
  return api('/workflows');
}
export function createWorkflow(body: {
  name: string;
  description?: string;
  triggers: string[];
  rule?: unknown;
  action: unknown;
  isActive?: boolean;
}): Promise<Workflow> {
  return api('/workflows', { method: 'POST', body: JSON.stringify(body) });
}
export function deleteWorkflow(id: string): Promise<void> {
  return api(`/workflows/${id}`, { method: 'DELETE' });
}
