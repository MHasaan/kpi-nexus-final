import { z } from 'zod';

export const AssignUserKpiDtoSchema = z
  .object({
    userId: z.string().trim().min(1),
    kpiId: z.string().trim().min(1),
    targetValue: z.number().finite().optional(),
  })
  .strict();
export type AssignUserKpiDto = z.infer<typeof AssignUserKpiDtoSchema>;
