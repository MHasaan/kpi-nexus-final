import { z } from 'zod';

const ThresholdBandFields = z
  .object({
    name: z.string().trim().min(1).max(80),
    lower: z.number().finite().nullable().optional(),
    upper: z.number().finite().nullable().optional(),
    color: z.string().trim().min(1).max(32),
    order: z.number().int().min(0).max(1000),
    consecutivePointsRequired: z.number().int().min(1).max(100).optional(),
  })
  .strict();

/** A band with both bounds set must have lower ≤ upper (BE-012). Open-ended bounds are fine. */
export function boundsOrdered(b: { lower?: number | null; upper?: number | null }): boolean {
  return b.lower == null || b.upper == null || b.lower <= b.upper;
}

const BOUNDS_MESSAGE = { message: 'lower must be less than or equal to upper', path: ['lower'] };

export const CreateThresholdBandDtoSchema = ThresholdBandFields.refine(boundsOrdered, BOUNDS_MESSAGE);
export type CreateThresholdBandDto = z.infer<typeof CreateThresholdBandDtoSchema>;

// A patch carrying both bounds is checked here; a patch changing one bound is
// checked against the stored row in the service.
export const UpdateThresholdBandDtoSchema = ThresholdBandFields.partial().strict().refine(boundsOrdered, BOUNDS_MESSAGE);
export type UpdateThresholdBandDto = z.infer<typeof UpdateThresholdBandDtoSchema>;
