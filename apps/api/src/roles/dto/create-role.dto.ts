import { z } from 'zod';

import { PermissionKeySchema } from '@kpi-nexus/contracts';

export const CreateRoleDtoSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(PermissionKeySchema).default([]),
  isAdmin: z.boolean().default(false),
  level: z.number().int().min(0).max(1000).default(0),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  canAccessModules: z.array(z.string()).default([]),
});

export type CreateRoleDto = z.infer<typeof CreateRoleDtoSchema>;
