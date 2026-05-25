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
  timezone: z.string().min(1).max(60).optional(),
  currency: z.string().length(3).optional(),
  locale: z.string().min(2).max(15).optional(),
  dateFormat: z.string().min(1).max(40).optional(),
  numberFormat: z.string().min(1).max(40).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
  // To clear, omit the field (Prisma JSON nullable requires sentinel).
  fiscalCalendar: z.record(z.unknown()).optional(),

  // Terminology — the 8 customizable labels
  roleLabel: z.string().trim().min(1).max(40).optional(),
  groupLabel: z.string().trim().min(1).max(40).optional(),
  memberLabel: z.string().trim().min(1).max(40).optional(),
  kpiLabel: z.string().trim().min(1).max(40).optional(),
  dashboardLabel: z.string().trim().min(1).max(40).optional(),
  scorecardLabel: z.string().trim().min(1).max(40).optional(),
  objectiveLabel: z.string().trim().min(1).max(40).optional(),
  taskLabel: z.string().trim().min(1).max(40).optional(),

  // Compliance
  dataResidency: z.enum(['US', 'EU', 'APAC', 'OTHER']).optional(),
  complianceProfile: z.array(z.string()).optional(),

  // Per-org policy override
  passwordPolicy: PasswordPolicySchema.optional(),
});

export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationDtoSchema>;
