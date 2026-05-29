import { z } from 'zod';

export const AssignOrgUnitKpiDtoSchema = z
  .object({
    kpiId: z.string().trim().min(1),
    targetValue: z.number().finite().optional(),
  })
  .strict();
export type AssignOrgUnitKpiDto = z.infer<typeof AssignOrgUnitKpiDtoSchema>;
