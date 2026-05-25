import { z } from 'zod';

export const CreateOrgUnitDtoSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).optional(),
  description: z.string().trim().max(500).optional(),
  /** Defaults to the org's default OrgUnitType when omitted. */
  orgUnitTypeId: z.string().optional(),
  parentUnitId: z.string().optional(),
  headUserId: z.string().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'PAUSED', 'ARCHIVED']).default('ACTIVE'),
  visibilityInherits: z.boolean().default(true),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateOrgUnitDto = z.infer<typeof CreateOrgUnitDtoSchema>;

export const UpdateOrgUnitDtoSchema = CreateOrgUnitDtoSchema.partial();
export type UpdateOrgUnitDto = z.infer<typeof UpdateOrgUnitDtoSchema>;

export const AddMemberDtoSchema = z.object({
  userId: z.string().min(1),
  memberRole: z.enum(['MEMBER', 'MANAGER', 'LEAD', 'DEPUTY']).default('MEMBER'),
});

export type AddMemberDto = z.infer<typeof AddMemberDtoSchema>;
