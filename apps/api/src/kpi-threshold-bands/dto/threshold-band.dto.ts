import { z } from 'zod';

export const CreateThresholdBandDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    lower: z.number().finite().nullable().optional(),
    upper: z.number().finite().nullable().optional(),
    color: z.string().trim().min(1).max(32),
    order: z.number().int().min(0).max(1000),
    consecutivePointsRequired: z.number().int().min(1).max(100).optional(),
  })
  .strict();
export type CreateThresholdBandDto = z.infer<typeof CreateThresholdBandDtoSchema>;

export const UpdateThresholdBandDtoSchema = CreateThresholdBandDtoSchema.partial().strict();
export type UpdateThresholdBandDto = z.infer<typeof UpdateThresholdBandDtoSchema>;
