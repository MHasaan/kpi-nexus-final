/**
 * Webhook events in words. They were offered by their codes alone
 * ("okr_progress_changed"). The code stays beside each one: it is what the
 * receiving system sees in the payload.
 *
 * Keep in step with `WEBHOOK_EVENT_CATALOG` in the API; an event with no entry
 * here is shown by its code.
 */
export const WEBHOOK_EVENT_LABELS: Record<string, string> = {
  data_point_added: 'A KPI value is recorded',
  alert_triggered: 'An alert fires',
  alert_escalated: 'An alert is escalated',
  alert_acknowledged: 'An alert is acknowledged',
  task_created: 'A task is created',
  task_assigned: 'A task is assigned',
  task_completed: 'A task is completed',
  okr_progress_changed: 'An objective’s progress changes',
  approval_request_created: 'An approval is requested',
  approval_request_decided: 'An approval is decided',
  comment_added: 'A comment is added',
  mention_received: 'Someone is mentioned',
  integration_connected: 'An integration is connected',
  integration_disconnected: 'An integration is disconnected',
  connector_run_completed: 'A data connector finishes a run',
};

export function webhookEventLabel(event: string): string {
  return WEBHOOK_EVENT_LABELS[event] ?? event;
}
