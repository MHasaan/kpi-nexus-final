import { z } from 'zod';

export const CreateResourcePermissionDtoSchema = z.object({
  subjectType: z.enum(['user', 'role']),
  subjectId: z.string().min(1),
  /** verb on the resource: "view", "edit", "delete", "data_entry", etc. */
  action: z.string().trim().min(1).max(40),
  /** model key — e.g. "kpi", "dashboard", "report". */
  resourceType: z.string().trim().min(1).max(40),
  resourceId: z.string().min(1),
  expiresAt: z.coerce.date().optional(),
});

export type CreateResourcePermissionDto = z.infer<typeof CreateResourcePermissionDtoSchema>;
