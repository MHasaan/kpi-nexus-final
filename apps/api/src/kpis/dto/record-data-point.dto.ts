import { z } from 'zod';

/** Body for POST /kpis/:id/data + the two assignment endpoints. */
export const RecordDataPointDtoSchema = z
  .object({
    value: z.number().finite(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    unit: z.string().trim().max(40).optional(),
    sourceType: z
      .enum(['MANUAL', 'INGESTION', 'COMPUTED', 'INTEGRATION'])
      .default('MANUAL'),
    sourceRef: z.string().trim().max(200).optional(),
    qualityFlag: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('HIGH'),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'periodEnd must be at or after periodStart',
    path: ['periodEnd'],
  });

export type RecordDataPointDto = z.infer<typeof RecordDataPointDtoSchema>;
