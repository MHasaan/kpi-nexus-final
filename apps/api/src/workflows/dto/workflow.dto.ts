import { z } from 'zod';

export const WorkflowTriggerSchema = z.enum(['kpi_changed', 'schedule', 'alert', 'manual']);

export const CreateWorkflowDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    triggers: z.array(WorkflowTriggerSchema).min(1),
    rule: z.record(z.string(), z.unknown()).nullable().optional(),
    action: z.record(z.string(), z.unknown()),
    isActive: z.boolean().optional(),
    scheduleCron: z.string().trim().max(100).optional(),
  })
  .strict();
export type CreateWorkflowDto = z.infer<typeof CreateWorkflowDtoSchema>;

export const UpdateWorkflowDtoSchema = CreateWorkflowDtoSchema.partial().strict();
export type UpdateWorkflowDto = z.infer<typeof UpdateWorkflowDtoSchema>;
