import { z } from 'zod';

import { BENCHMARK_KINDS } from '../benchmark-compute.js';

export const CreateBenchmarkDtoSchema = z
  .object({
    kind: z.enum(BENCHMARK_KINDS),
    value: z.number().finite(),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    source: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type CreateBenchmarkDto = z.infer<typeof CreateBenchmarkDtoSchema>;

export const ComputeBenchmarkDtoSchema = z
  .object({
    // Only INTERNAL_HISTORICAL is computable; the field is fixed but accepted
    // for forward-compatibility and explicitness at the call site.
    kind: z.literal('INTERNAL_HISTORICAL').default('INTERNAL_HISTORICAL'),
    days: z.number().int().min(1).max(3650).default(30),
  })
  .strict();
export type ComputeBenchmarkDto = z.infer<typeof ComputeBenchmarkDtoSchema>;
