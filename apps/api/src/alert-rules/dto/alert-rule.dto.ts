import { z } from 'zod';

// ---------------------------------------------------------------------------
// Rule-type-specific config schemas.
//
// Every type is evaluated: STATIC_THRESHOLD, DYNAMIC_STDDEV, RATE_OF_CHANGE and
// COMPOSITE when a value is recorded, NO_DATA by a clock scan. `cooldownMinutes`
// is common to all types: when > 0, a new Alert is suppressed if one already
// exists for the same (alertRuleId, kpiId) within the window.
// ---------------------------------------------------------------------------

const cooldown = z.number().int().min(0).max(10080).optional(); // ≤ 7 days

export const StaticThresholdConfigSchema = z
  .object({
    operator: z.enum(['>', '<', '>=', '<=', '==']),
    value: z.number(),
    cooldownMinutes: cooldown,
  })
  .strict();

export const DynamicStddevConfigSchema = z
  .object({
    sigmas: z.number().positive().max(10),
    windowSize: z.number().int().min(2).max(1000),
    cooldownMinutes: cooldown,
  })
  .strict();

export const RateOfChangeConfigSchema = z
  .object({
    // Signed: 20 = a rise of 20% or more, -20 = a fall of 20% or more. Zero has no direction.
    pctChange: z.number().refine((n) => n !== 0, 'Give a percentage other than zero: positive for a rise, negative for a fall'),
    windowMinutes: z.number().int().min(1).max(525600), // ≤ 1 year
    cooldownMinutes: cooldown,
  })
  .strict();

export const NoDataConfigSchema = z
  .object({
    maxStaleMinutes: z.number().int().min(1),
    cooldownMinutes: cooldown,
  })
  .strict();

// COMPOSITE joins conditions on the same KPI with AND / OR. Each part is one of
// the kinds that are judged when a value is recorded, with that kind's own
// config. NO_DATA is not allowed as a part: it holds only while nothing is
// arriving, so joined to a value-triggered condition it could never fire.
const CompositePartSchema = z.discriminatedUnion('ruleType', [
  z.object({ ruleType: z.literal('STATIC_THRESHOLD'), config: StaticThresholdConfigSchema }).strict(),
  z.object({ ruleType: z.literal('DYNAMIC_STDDEV'), config: DynamicStddevConfigSchema }).strict(),
  z.object({ ruleType: z.literal('RATE_OF_CHANGE'), config: RateOfChangeConfigSchema }).strict(),
]);

export const CompositeConfigSchema = z
  .object({
    operator: z.enum(['AND', 'OR']),
    rules: z.array(CompositePartSchema).min(1).max(10),
    cooldownMinutes: cooldown,
  })
  .strict();

export type StaticThresholdConfig = z.infer<typeof StaticThresholdConfigSchema>;
export type DynamicStddevConfig = z.infer<typeof DynamicStddevConfigSchema>;
export type RateOfChangeConfig = z.infer<typeof RateOfChangeConfigSchema>;
export type NoDataConfig = z.infer<typeof NoDataConfigSchema>;
export type CompositeConfig = z.infer<typeof CompositeConfigSchema>;

// ---------------------------------------------------------------------------
// Escalation levels — the EscalationRule.levels JSON shape.
// ---------------------------------------------------------------------------
export const EscalationLevelSchema = z
  .object({
    delayMinutes: z.number().int().min(0).max(10080),
    channelIds: z.array(z.string()).default([]),
    notifyRoleIds: z.array(z.string()).default([]),
    notifyUserIds: z.array(z.string()).default([]),
  })
  .strict();
export type EscalationLevel = z.infer<typeof EscalationLevelSchema>;

// ---------------------------------------------------------------------------
// Create / Update DTOs — discriminated union on ruleType so config is typed.
// ---------------------------------------------------------------------------
const baseFields = {
  kpiId: z.string().min(1),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  isActive: z.boolean().default(true),
  // Optional escalation policy upserted in the same transaction.
  escalationLevels: z.array(EscalationLevelSchema).max(10).optional(),
};

export const CreateAlertRuleDtoSchema = z.discriminatedUnion('ruleType', [
  z.object({ ruleType: z.literal('STATIC_THRESHOLD'), config: StaticThresholdConfigSchema, ...baseFields }),
  z.object({ ruleType: z.literal('DYNAMIC_STDDEV'), config: DynamicStddevConfigSchema, ...baseFields }),
  z.object({ ruleType: z.literal('RATE_OF_CHANGE'), config: RateOfChangeConfigSchema, ...baseFields }),
  z.object({ ruleType: z.literal('NO_DATA'), config: NoDataConfigSchema, ...baseFields }),
  z.object({ ruleType: z.literal('COMPOSITE'), config: CompositeConfigSchema, ...baseFields }),
]);
export type CreateAlertRuleDto = z.infer<typeof CreateAlertRuleDtoSchema>;

// Update: only mutable presentation/activation fields + optional escalation.
// Changing ruleType/config wholesale is done by recreating the rule (keeps the
// config↔ruleType invariant simple and avoids partial-union validation).
export const UpdateAlertRuleDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(2000).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
    isActive: z.boolean().optional(),
    escalationLevels: z.array(EscalationLevelSchema).max(10).optional(),
  })
  .strict();
export type UpdateAlertRuleDto = z.infer<typeof UpdateAlertRuleDtoSchema>;

// Acknowledge / resolve body (no fields yet; reserved for note).
export const AlertActionDtoSchema = z
  .object({ note: z.string().trim().max(1000).optional() })
  .strict();
export type AlertActionDto = z.infer<typeof AlertActionDtoSchema>;
