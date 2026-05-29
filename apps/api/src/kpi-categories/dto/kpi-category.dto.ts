import { z } from 'zod';

export const CreateKpiCategoryDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional(),
    color: z.string().trim().max(32).optional(),
    icon: z.string().trim().max(64).optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();
export type CreateKpiCategoryDto = z.infer<typeof CreateKpiCategoryDtoSchema>;

export const UpdateKpiCategoryDtoSchema = CreateKpiCategoryDtoSchema.partial().strict();
export type UpdateKpiCategoryDto = z.infer<typeof UpdateKpiCategoryDtoSchema>;
