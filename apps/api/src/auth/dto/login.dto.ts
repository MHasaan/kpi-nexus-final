import { z } from 'zod';

export const LoginDtoSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  /** Required when the email exists in more than one org. */
  organizationId: z.string().optional(),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const RefreshDtoSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshDto = z.infer<typeof RefreshDtoSchema>;
