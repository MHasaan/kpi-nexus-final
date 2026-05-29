import { z } from 'zod';

export const OffboardDtoSchema = z
  .object({
    transferKpisTo: z.string().trim().min(1).optional(),
    reparentDirectReportsTo: z.string().trim().min(1).optional(),
    leaveReason: z.enum(['TRANSFERRED', 'PROMOTED', 'LEFT_ORG', 'STRUCTURE_CHANGE']).optional(),
    archive: z.boolean().optional(),
  })
  .strict();
export type OffboardDto = z.infer<typeof OffboardDtoSchema>;
