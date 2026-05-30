/**
 * Pure Jira → Task status mapping for the Jira issue-update webhook. Returns the
 * Task status enum value, or null for Jira statuses we don't mirror.
 */
export type TaskStatusValue = 'TODO' | 'IN_PROGRESS' | 'DONE';

export function mapJiraStatusToTask(jiraStatus: string): TaskStatusValue | null {
  const normalized = jiraStatus.trim().toLowerCase();
  switch (normalized) {
    case 'to do':
    case 'todo':
    case 'open':
      return 'TODO';
    case 'in progress':
    case 'in-progress':
      return 'IN_PROGRESS';
    case 'done':
    case 'closed':
    case 'resolved':
      return 'DONE';
    default:
      return null;
  }
}
