import { ResourceActionSchema } from '@kpi-nexus/contracts';
import { z } from 'zod';

export const CreateResourcePermissionDtoSchema = z.object({
  subjectType: z.enum(['user', 'role']),
  subjectId: z.string().min(1),
  /** verb on the resource — one of the canonical {@link ResourceActionSchema} values. */
  action: ResourceActionSchema,
  /** model key — e.g. "kpi", "dashboard", "report". */
  resourceType: z.string().trim().min(1).max(40),
  resourceId: z.string().min(1),
  expiresAt: z.coerce.date().optional(),
});

export type CreateResourcePermissionDto = z.infer<typeof CreateResourcePermissionDtoSchema>;
