import { z } from 'zod';

export const RollupMethodEnum = z.enum([
  'SUM',
  'AVG',
  'WEIGHTED_AVG',
  'MIN',
  'MAX',
  'CUSTOM_FORMULA',
]);

export const AttachCascadeDtoSchema = z
  .object({
    parentKpiId: z.string().trim().min(1),
    childKpiId: z.string().trim().min(1),
    // Left out: the parent keeps the method it has (a sum if this is its first child),
    // and an edge that exists keeps its weight (1 for a new one).
    method: RollupMethodEnum.optional(),
    weight: z.number().finite().min(0).optional(),
    customFormula: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export type AttachCascadeDto = z.infer<typeof AttachCascadeDtoSchema>;
