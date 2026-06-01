import { z } from 'zod';

export const InvitationPreviewDtoSchema = z.object({
  token: z.string().min(1),
});

export type InvitationPreviewDto = z.infer<typeof InvitationPreviewDtoSchema>;
