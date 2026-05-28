import { z } from 'zod';

/**
 * Server-Sent Events (SSE) payload schema for real-time updates.
 *
 * Grows as modules ship — every new event variant must be added to the
 * discriminated union so consumers get exhaustiveness checks.
 *
 * Only `ping` and `data_point_added` are fully modeled in P3. Other event
 * types (alerts, NLQ, comments, etc.) are stubbed as REALTIME_EVENTS keys
 * and will get full Zod schemas when those phases land.
 */

// ---------------------------------------------------------------------------
// Canonical event type constants — import these instead of raw strings so
// a typo is a compile error.
// ---------------------------------------------------------------------------
export const REALTIME_EVENTS = {
  DATA_POINT_ADDED: 'data_point_added',
  ALERT_TRIGGERED: 'alert_triggered',
  ALERT_ESCALATED: 'alert_escalated',
  ALERT_DIGEST: 'alert_digest',
  DASHBOARD_WIDGET_ADDED: 'dashboard_widget_added',
  RECOMMENDATION_READY: 'recommendation_ready',
  NLQ_RESPONSE_READY: 'nlq_response_ready',
  COMMENT_ADDED: 'comment_added',
  MENTION_RECEIVED: 'mention_received',
  TASK_ASSIGNED: 'task_assigned',
  ORG_SETTINGS_UPDATED: 'org_settings_updated',
} as const;

export type RealtimeEventType = (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

// ---------------------------------------------------------------------------
// Individual event schemas (P3: ping + data_point_added)
// ---------------------------------------------------------------------------

export const RealtimePingEventSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.string().datetime(),
});

export const RealtimeDataPointAddedEventSchema = z.object({
  type: z.literal('data_point_added'),
  kpiId: z.string(),
  dataPointId: z.string(),
  value: z.number(),
  /** ISO-8601 datetime string */
  recordedAt: z.string().datetime(),
  orgUnitId: z.string().nullable(),
  userId: z.string().nullable(),
  /** Present when the widget that triggered the update is known */
  dashboardId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Discriminated union — add new variants here as phases land
// ---------------------------------------------------------------------------
export const RealtimeEventSchema = z.discriminatedUnion('type', [
  RealtimePingEventSchema,
  RealtimeDataPointAddedEventSchema,
]);

// ---------------------------------------------------------------------------
// Derived TypeScript types
// ---------------------------------------------------------------------------
export type RealtimePingEvent = z.infer<typeof RealtimePingEventSchema>;
export type RealtimeDataPointAddedEvent = z.infer<typeof RealtimeDataPointAddedEventSchema>;
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;

// ---------------------------------------------------------------------------
// Query / filter schema (used by both the controller and the service)
// ---------------------------------------------------------------------------
export const RealtimeStreamQuerySchema = z.object({
  kpiId: z.string().optional(),
  dashboardId: z.string().optional(),
});

export type RealtimeStreamQuery = z.infer<typeof RealtimeStreamQuerySchema>;
