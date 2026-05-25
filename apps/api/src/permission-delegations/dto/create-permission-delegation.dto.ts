import { z } from 'zod';

import { PermissionKeySchema } from '@kpi-nexus/contracts';

export const CreatePermissionDelegationDtoSchema = z
  .object({
    grantorUserId: z.string().min(1),
    granteeUserId: z.string().min(1),
    /** Empty array means "inherit ALL of grantor's permissions during the window". */
    permissions: z.array(PermissionKeySchema).default([]),
    reason: z.string().trim().max(500).optional(),
    validFrom: z.coerce.date(),
    validTo: z.coerce.date(),
  })
  .refine((dto) => dto.validTo.getTime() > dto.validFrom.getTime(), {
    message: 'validTo must be after validFrom',
    path: ['validTo'],
  })
  .refine((dto) => dto.grantorUserId !== dto.granteeUserId, {
    message: 'grantor and grantee must be different users',
    path: ['granteeUserId'],
  });

export type CreatePermissionDelegationDto = z.infer<typeof CreatePermissionDelegationDtoSchema>;
