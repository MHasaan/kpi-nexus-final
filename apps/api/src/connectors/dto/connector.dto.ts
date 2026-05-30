import { z } from 'zod';

export const ConnectorTypeSchema = z.enum(['REST', 'GRAPHQL', 'POSTGRES', 'MYSQL', 'S3', 'GCS', 'WEBHOOK']);

export const CreateConnectorDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    type: ConnectorTypeSchema,
    config: z.record(z.string(), z.unknown()),
    schedule: z.string().trim().max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CreateConnectorDto = z.infer<typeof CreateConnectorDtoSchema>;

export const UpdateConnectorDtoSchema = CreateConnectorDtoSchema.partial().strict();
export type UpdateConnectorDto = z.infer<typeof UpdateConnectorDtoSchema>;
