import { z } from 'zod';

export const KpiTargetTypeEnum = z.enum([
  'STATIC',
  'TIERED',
  'DYNAMIC',
  'TIME_VARYING',
  'CONDITIONAL',
  'SCENARIO',
]);
export type KpiTargetType = z.infer<typeof KpiTargetTypeEnum>;

export const CreateKpiTargetDtoSchema = z
  .object({
    type: KpiTargetTypeEnum.default('STATIC'),
    value: z.number().finite().optional(),
    minValue: z.number().finite().optional(),
    expectedValue: z.number().finite().optional(),
    stretchValue: z.number().finite().optional(),
    impossibleValue: z.number().finite().optional(),
    formula: z.string().trim().max(2000).optional(),
    metadata: z.record(z.unknown()).optional(),
    effectiveFrom: z.string().datetime().transform((s) => new Date(s)).optional(),
    effectiveTo: z.string().datetime().transform((s) => new Date(s)).optional(),
    scenarioName: z.string().trim().max(120).optional(),
  })
  .strict();
export type CreateKpiTargetDto = z.infer<typeof CreateKpiTargetDtoSchema>;

export const UpdateKpiTargetDtoSchema = CreateKpiTargetDtoSchema.partial().strict();
export type UpdateKpiTargetDto = z.infer<typeof UpdateKpiTargetDtoSchema>;

export type KpiDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_IS_BEST' | 'NEUTRAL';

/**
 * Validate a target's type-specific requirements + (for TIERED/SCENARIO) the
 * monotonic band ordering relative to the KPI's direction. Returns a list of
 * human-readable errors ([] = valid). Pure → unit-testable.
 */
export function validateTarget(
  dto: Pick<
    CreateKpiTargetDto,
    | 'type'
    | 'value'
    | 'minValue'
    | 'expectedValue'
    | 'stretchValue'
    | 'impossibleValue'
    | 'formula'
    | 'metadata'
    | 'effectiveFrom'
    | 'scenarioName'
  >,
  direction: KpiDirection,
): string[] {
  const errors: string[] = [];
  switch (dto.type) {
    case 'STATIC':
      if (dto.value === undefined) errors.push('STATIC target requires `value`');
      break;
    case 'DYNAMIC':
      if (!dto.formula) errors.push('DYNAMIC target requires `formula`');
      break;
    case 'TIME_VARYING':
      if (!dto.effectiveFrom) errors.push('TIME_VARYING target requires `effectiveFrom`');
      break;
    case 'CONDITIONAL':
      if (!dto.metadata || dto.metadata.condition === undefined) {
        errors.push('CONDITIONAL target requires `metadata.condition`');
      }
      break;
    case 'SCENARIO':
      if (!dto.scenarioName) errors.push('SCENARIO target requires `scenarioName`');
      errors.push(...validateBands(dto, direction));
      break;
    case 'TIERED':
      errors.push(...validateBands(dto, direction));
      break;
  }
  return errors;
}

function validateBands(
  dto: Pick<CreateKpiTargetDto, 'minValue' | 'expectedValue' | 'stretchValue' | 'impossibleValue'>,
  direction: KpiDirection,
): string[] {
  const bands = [dto.minValue, dto.expectedValue, dto.stretchValue, dto.impossibleValue].filter(
    (b): b is number => b !== undefined,
  );
  if (bands.length === 0) {
    return ['TIERED/SCENARIO target requires at least one band (min/expected/stretch/impossible)'];
  }
  // Expected ordering: min ≤ expected ≤ stretch ≤ impossible for HIGHER_IS_BETTER,
  // reversed for LOWER_IS_BETTER. Other directions impose no ordering.
  if (direction === 'HIGHER_IS_BETTER' || direction === 'LOWER_IS_BETTER') {
    const ascending = direction === 'HIGHER_IS_BETTER';
    for (let i = 1; i < bands.length; i++) {
      const ok = ascending ? bands[i]! >= bands[i - 1]! : bands[i]! <= bands[i - 1]!;
      if (!ok) {
        return [
          `bands must be monotonic (${ascending ? 'min ≤ expected ≤ stretch ≤ impossible' : 'min ≥ expected ≥ stretch ≥ impossible'}) for ${direction}`,
        ];
      }
    }
  }
  return [];
}
