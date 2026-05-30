/**
 * Catalog of dispatchable webhook events. Subscriptions store an `events[]`
 * subset (free-form strings on the model); this constant is the canonical list
 * the UI offers and that producers should emit. Extended in P8 with the P7
 * collaboration + P8 integration domain events.
 */
export const WEBHOOK_EVENT_CATALOG = [
  // P3/P4 core
  'data_point_added',
  'alert_triggered',
  'alert_escalated',
  'alert_acknowledged',
  // P7 collaboration
  'task_created',
  'task_assigned',
  'task_completed',
  'okr_progress_changed',
  'approval_request_created',
  'approval_request_decided',
  'comment_added',
  'mention_received',
  // P8 integrations
  'integration_connected',
  'integration_disconnected',
  'connector_run_completed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENT_CATALOG)[number];
