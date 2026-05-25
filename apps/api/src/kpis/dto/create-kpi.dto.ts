import { z } from 'zod';

export const KpiScopeEnum = z.enum(['ORG_WIDE', 'PER_UNIT', 'PER_USER']);
export const KpiTypeEnum = z.enum([
  'NUMBER',
  'PERCENTAGE',
  'CURRENCY',
  'DURATION',
  'COUNT',
  'RATING',
  'BOOLEAN',
]);
export const KpiDirectionEnum = z.enum([
  'HIGHER_IS_BETTER',
  'LOWER_IS_BETTER',
  'TARGET_IS_BEST',
  'NEUTRAL',
]);
export const KpiFrequencyEnum = z.enum([
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM',
  'REAL_TIME',
  'AD_HOC',
]);
export const KpiAggregationEnum = z.enum([
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'MEDIAN',
  'P25',
  'P75',
  'P90',
  'P95',
  'P99',
  'LAST',
  'FIRST',
  'COUNT',
  'COUNT_DISTINCT',
  'STDEV',
]);
export const KpiStatusEnum = z.enum([
  'DRAFT',
  'PROPOSED',
  'APPROVED',
  'ACTIVE',
  'PAUSED',
  'DEPRECATED',
  'ARCHIVED',
]);

export const CreateKpiDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    unit: z.string().trim().max(40).optional(),
    categoryId: z.string().optional(),
    scope: KpiScopeEnum.default('ORG_WIDE'),
    type: KpiTypeEnum.default('NUMBER'),
    direction: KpiDirectionEnum.default('HIGHER_IS_BETTER'),
    frequency: KpiFrequencyEnum.default('MONTHLY'),
    aggregationMethod: KpiAggregationEnum.default('LAST'),
    status: KpiStatusEnum.default('DRAFT'),
    targetValue: z.number().finite().optional(),
    warningThreshold: z.number().finite().optional(),
    criticalThreshold: z.number().finite().optional(),
    allowNegative: z.boolean().default(false),
    ownerUserId: z.string().optional(),
    tags: z.array(z.string()).default([]),
    // Scope-specific assignments — validated by service (e.g. PER_UNIT
    // requires non-empty orgUnitIds; ORG_WIDE rejects both).
    orgUnitIds: z.array(z.string()).optional(),
    userIds: z.array(z.string()).optional(),
  })
  .strict();

export type CreateKpiDto = z.infer<typeof CreateKpiDtoSchema>;

export const UpdateKpiDtoSchema = CreateKpiDtoSchema.partial().strict();
export type UpdateKpiDto = z.infer<typeof UpdateKpiDtoSchema>;
