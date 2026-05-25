import { z } from 'zod';

export const AcceptInvitationDtoSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1).max(128),
});

export type AcceptInvitationDto = z.infer<typeof AcceptInvitationDtoSchema>;
