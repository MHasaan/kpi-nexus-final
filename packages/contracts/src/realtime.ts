import { z } from 'zod';

/**
 * Server-Sent Events (SSE) payload schema for real-time updates.
 *
 * Grows as modules ship — every new event variant must be added to the
 * discriminated union so consumers get exhaustiveness checks.
 */
export const RealtimePingEventSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.string().datetime(),
});

export const RealtimeEventSchema = z.discriminatedUnion('type', [
  RealtimePingEventSchema,
]);

export type RealtimePingEvent = z.infer<typeof RealtimePingEventSchema>;
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
