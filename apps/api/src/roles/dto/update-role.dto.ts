import { z } from 'zod';
import { DataTypeConfigSchema, ScopeConfigSchema } from '@kpi-nexus/contracts';

import { CreateRoleDtoSchema } from './create-role.dto.js';

export const UpdateRoleDtoSchema = CreateRoleDtoSchema.partial().extend({
  /** Layer-2 per-domain scope override for this role (Phase 2). */
  scopeConfig: ScopeConfigSchema.optional(),
  /** Layer-3 data-type (KPI category) allowlist for this role (Phase 3). */
  dataTypeConfig: DataTypeConfigSchema.optional(),
});
export type UpdateRoleDto = z.infer<typeof UpdateRoleDtoSchema>;
