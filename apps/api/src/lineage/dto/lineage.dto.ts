import { z } from 'zod';

/** Query for the upstream/downstream (single-direction, bounded-depth) endpoints. */
export const LineageDepthQuerySchema = z
  .object({
    depth: z.coerce.number().int().min(1).max(20).default(1),
  })
  .strict();
export type LineageDepthQuery = z.infer<typeof LineageDepthQuerySchema>;

/** Query for the full trace endpoint. */
export const LineageTraceQuerySchema = z
  .object({
    maxDepth: z.coerce.number().int().min(1).max(20).default(5),
  })
  .strict();
export type LineageTraceQuery = z.infer<typeof LineageTraceQuerySchema>;

/** Input to the fire-and-forget recorder (used by other services). */
export interface RecordLineageInput {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  transformType: string;
  jobRunId?: string;
  metadata?: Record<string, unknown>;
}
