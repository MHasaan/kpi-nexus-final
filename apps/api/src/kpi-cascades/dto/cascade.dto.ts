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
    method: RollupMethodEnum.default('SUM'),
    weight: z.number().finite().min(0).default(1),
    customFormula: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export type AttachCascadeDto = z.infer<typeof AttachCascadeDtoSchema>;
