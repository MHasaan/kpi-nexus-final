import { z } from 'zod';

import { isValidCron } from '../../reports/cron.js';

export const ConnectorTypeSchema = z.enum(['REST', 'GRAPHQL', 'POSTGRES', 'MYSQL', 'S3', 'GCS', 'WEBHOOK']);

/**
 * A connector schedule is a 5-field cron the scheduler can parse. The 6-field
 * (seconds) form is refused: a connector calls an outside URL, so it runs at
 * most once a minute. '' (or null on update) means manual only.
 */
export function isValidConnectorSchedule(schedule: string): boolean {
  return schedule === '' || (schedule.split(/\s+/).length === 5 && isValidCron(schedule));
}

export const CreateConnectorDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    type: ConnectorTypeSchema,
    config: z.record(z.string(), z.unknown()),
    schedule: z
      .string()
      .trim()
      .max(100)
      .refine(isValidConnectorSchedule, { message: 'schedule must be a 5-field cron expression, e.g. "0 8 * * *"' })
      .optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CreateConnectorDto = z.infer<typeof CreateConnectorDtoSchema>;

export const UpdateConnectorDtoSchema = CreateConnectorDtoSchema.extend({
  schedule: CreateConnectorDtoSchema.shape.schedule.unwrap().nullable().optional(),
})
  .partial()
  .strict();
export type UpdateConnectorDto = z.infer<typeof UpdateConnectorDtoSchema>;
