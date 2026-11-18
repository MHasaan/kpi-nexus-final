import { z } from 'zod';

import { partialUpdate } from '../../common/partial-update.js';

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

// On update, null takes a value away: no track, no pay grade, no description.
export const UpdatePositionDtoSchema = partialUpdate(CreatePositionDtoSchema).extend({
  track: z.enum(['IC', 'MANAGEMENT', 'EXECUTIVE']).nullable().optional(),
  payGrade: z.string().trim().max(20).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});
export type UpdatePositionDto = z.infer<typeof UpdatePositionDtoSchema>;
