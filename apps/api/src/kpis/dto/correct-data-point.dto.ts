import { z } from 'zod';

/** Body for PATCH /kpis/:id/data/:pointId — correct a recorded value and/or its note. */
export const CorrectDataPointDtoSchema = z
  .object({
    value: z.number().finite().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((v) => v.value !== undefined || v.note !== undefined, {
    message: 'Give a new value or note',
    path: ['value'],
  });

export type CorrectDataPointDto = z.infer<typeof CorrectDataPointDtoSchema>;
