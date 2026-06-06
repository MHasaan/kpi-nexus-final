import { z } from 'zod';

export const ObjectiveStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'AT_RISK', 'ACHIEVED', 'MISSED', 'ARCHIVED']);

export const CreateObjectiveDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    ownerUserId: z.string().trim().min(1),
    parentObjectiveId: z.string().trim().min(1).optional(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    status: ObjectiveStatusSchema.optional(),
  })
  .strict();
export type CreateObjectiveDto = z.infer<typeof CreateObjectiveDtoSchema>;

export const UpdateObjectiveDtoSchema = CreateObjectiveDtoSchema.partial()
  .extend({
    // Allow explicitly clearing optional links on update by sending null.
    description: z.string().trim().max(2000).nullable().optional(),
    parentObjectiveId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export type UpdateObjectiveDto = z.infer<typeof UpdateObjectiveDtoSchema>;

export const ListObjectivesQuerySchema = z
  .object({
    status: ObjectiveStatusSchema.optional(),
    ownerUserId: z.string().trim().min(1).optional(),
    parentObjectiveId: z.string().trim().min(1).optional(),
  })
  .strict();
export type ListObjectivesQuery = z.infer<typeof ListObjectivesQuerySchema>;

export const CreateKeyResultDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    kpiId: z.string().trim().min(1).optional(),
    baselineValue: z.number().optional(),
    targetValue: z.number(),
    currentValue: z.number().optional(),
    weight: z.number().min(0).max(1000).optional(),
  })
  .strict();
export type CreateKeyResultDto = z.infer<typeof CreateKeyResultDtoSchema>;

export const UpdateKeyResultDtoSchema = CreateKeyResultDtoSchema.partial()
  .extend({
    // Allow explicitly clearing the linked KPI by sending null.
    kpiId: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export type UpdateKeyResultDto = z.infer<typeof UpdateKeyResultDtoSchema>;
