import { z } from 'zod';

export const ApprovalEntityTypeSchema = z.enum(['KPI_DEFINITION', 'KPI_TARGET', 'ROLE_PERMISSIONS']);

export const UpsertWorkflowDtoSchema = z
  .object({
    requiredApproverRoleIds: z.array(z.string().trim().min(1)).max(50),
    requireAll: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpsertWorkflowDto = z.infer<typeof UpsertWorkflowDtoSchema>;

export const DecideDtoSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    comment: z.string().trim().max(2000).optional(),
  })
  .strict();
export type DecideDto = z.infer<typeof DecideDtoSchema>;

export const ListRequestsQuerySchema = z
  .object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
    entityType: ApprovalEntityTypeSchema.optional(),
  })
  .strict();
export type ListRequestsQuery = z.infer<typeof ListRequestsQuerySchema>;
