import { z } from 'zod';

export const InviteUserDtoSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  roleId: z.string().optional(),
  positionId: z.string().optional(),
});

export type InviteUserDto = z.infer<typeof InviteUserDtoSchema>;
