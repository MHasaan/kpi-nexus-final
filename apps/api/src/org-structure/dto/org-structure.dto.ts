import { z } from 'zod';

export const CreateDimensionDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    isDefault: z.boolean().optional(),
  })
  .strict();
export type CreateDimensionDto = z.infer<typeof CreateDimensionDtoSchema>;
export const UpdateDimensionDtoSchema = CreateDimensionDtoSchema.partial().strict();
export type UpdateDimensionDto = z.infer<typeof UpdateDimensionDtoSchema>;

export const CreateTypeDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    namePlural: z.string().trim().min(1).max(80),
    dimensionId: z.string().trim().min(1).optional(),
    icon: z.string().trim().max(40).optional(),
    color: z.string().trim().max(32).optional(),
    allowNesting: z.boolean().optional(),
    maxDepth: z.number().int().min(1).max(20).optional(),
    allowedParentTypeIds: z.array(z.string().trim().min(1)).optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict();
export type CreateTypeDto = z.infer<typeof CreateTypeDtoSchema>;
export const UpdateTypeDtoSchema = CreateTypeDtoSchema.partial().strict();
export type UpdateTypeDto = z.infer<typeof UpdateTypeDtoSchema>;
