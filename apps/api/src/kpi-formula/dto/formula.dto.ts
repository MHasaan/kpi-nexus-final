import { z } from 'zod';

export const AttachFormulaDtoSchema = z
  .object({
    raw: z.string().trim().min(1).max(1000),
  })
  .strict();
export type AttachFormulaDto = z.infer<typeof AttachFormulaDtoSchema>;
