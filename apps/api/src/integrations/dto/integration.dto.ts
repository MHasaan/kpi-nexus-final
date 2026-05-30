import { z } from 'zod';

export const CreateIntegrationDtoSchema = z
  .object({
    provider: z.string().trim().min(1).max(64),
    displayName: z.string().trim().max(120).optional(),
    tokens: z.record(z.string(), z.unknown()),
    scopes: z.array(z.string().trim().min(1)).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type CreateIntegrationDto = z.infer<typeof CreateIntegrationDtoSchema>;
