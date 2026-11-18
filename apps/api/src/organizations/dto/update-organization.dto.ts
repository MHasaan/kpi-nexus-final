import { DATE_FORMATS, NUMBER_FORMATS, isCurrency, isLocale, isTimeZone } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { PasswordPolicySchema } from '../../password/password-policy.js';

/**
 * Patch-style DTO for `/organizations/me`. All fields optional — caller
 * supplies only what they want to change. Fields you cannot change here:
 * id, slug, tenantStatus, planKey (lifecycle / billing endpoints handle
 * those).
 */
export const UpdateOrganizationDtoSchema = z.object({
  // Identity
  name: z.string().trim().min(2).max(120).optional(),
  industry: z.string().trim().max(60).optional(),
  type: z.string().trim().max(60).optional(),
  sizeTier: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']).optional(),

  // Branding
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),

  // Locale + fiscal
  // These five decide how every date and number is written (plan 6.1), so a value nothing can format with is refused.
  timezone: z.string().min(1).max(60).refine(isTimeZone, { message: 'timezone must be an IANA name such as Asia/Karachi' }).optional(),
  currency: z.string().length(3).refine(isCurrency, { message: 'currency must be an ISO 4217 code such as USD' }).optional(),
  locale: z.string().min(2).max(15).refine(isLocale, { message: 'locale must be a language tag such as en-US' }).optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  numberFormat: z.enum(NUMBER_FORMATS).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  // To clear, omit the field (Prisma JSON nullable requires sentinel).
  fiscalCalendar: z.record(z.string(), z.unknown()).optional(),

  // Terminology — the 8 customizable labels
  roleLabel: z.string().trim().min(1).max(40).optional(),
  groupLabel: z.string().trim().min(1).max(40).optional(),
  memberLabel: z.string().trim().min(1).max(40).optional(),
  kpiLabel: z.string().trim().min(1).max(40).optional(),
  dashboardLabel: z.string().trim().min(1).max(40).optional(),
  scorecardLabel: z.string().trim().min(1).max(40).optional(),
  objectiveLabel: z.string().trim().min(1).max(40).optional(),
  taskLabel: z.string().trim().min(1).max(40).optional(),

  // Terminology — optional plural overrides (nullable: pass null to clear).
  roleLabelPlural: z.string().trim().max(40).nullish(),
  groupLabelPlural: z.string().trim().max(40).nullish(),
  memberLabelPlural: z.string().trim().max(40).nullish(),
  kpiLabelPlural: z.string().trim().max(40).nullish(),
  dashboardLabelPlural: z.string().trim().max(40).nullish(),
  scorecardLabelPlural: z.string().trim().max(40).nullish(),
  objectiveLabelPlural: z.string().trim().max(40).nullish(),
  taskLabelPlural: z.string().trim().max(40).nullish(),

  // Compliance
  dataResidency: z.enum(['US', 'EU', 'APAC', 'OTHER']).optional(),
  complianceProfile: z.array(z.string()).optional(),

  // Per-org policy override
  passwordPolicy: PasswordPolicySchema.optional(),
});

export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationDtoSchema>;
