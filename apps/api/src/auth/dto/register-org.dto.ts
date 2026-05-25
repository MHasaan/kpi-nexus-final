import { z } from 'zod';

export const RegisterOrgDtoSchema = z.object({
  orgName: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'slug must be lowercase letters, digits, hyphens'),
  adminEmail: z.string().trim().toLowerCase().email(),
  adminPassword: z.string().min(8).max(128),
  adminFullName: z.string().trim().min(2).max(120),
});

export type RegisterOrgDto = z.infer<typeof RegisterOrgDtoSchema>;
