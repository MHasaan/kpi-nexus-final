import { z } from 'zod';

export const IngestRowSchema = z.object({
  kpiId: z.string().trim().min(1),
  value: z.number().finite(),
  recordedAt: z.coerce.date().optional(),
  qualityFlag: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  idempotencyKey: z.string().trim().max(200).optional(),
});

export const IngestDtoSchema = z
  .object({
    source: z.string().trim().max(120).optional(),
    rows: z.array(IngestRowSchema).min(1).max(10_000),
  })
  .strict();
export type IngestDto = z.infer<typeof IngestDtoSchema>;
