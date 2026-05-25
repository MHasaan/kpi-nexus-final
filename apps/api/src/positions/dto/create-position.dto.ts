import { z } from 'zod';

export const CreatePositionDtoSchema = z.object({
  name: z.string().trim().min(2).max(60),
  level: z.number().int().min(0).max(100).default(0),
  track: z.enum(['IC', 'MANAGEMENT', 'EXECUTIVE']).optional(),
  payGrade: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
  orgUnitId: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type CreatePositionDto = z.infer<typeof CreatePositionDtoSchema>;

export const UpdatePositionDtoSchema = CreatePositionDtoSchema.partial();
export type UpdatePositionDto = z.infer<typeof UpdatePositionDtoSchema>;
