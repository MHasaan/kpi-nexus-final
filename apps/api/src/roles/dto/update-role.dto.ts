import { z } from 'zod';
import {
  DataLimitsConfigSchema,
  DataTypeConfigSchema,
  PageAccessConfigSchema,
  ScopeConfigSchema,
} from '@kpi-nexus/contracts';

import { partialUpdate } from '../../common/partial-update.js';
import { CreateRoleDtoSchema } from './create-role.dto.js';

export const UpdateRoleDtoSchema = partialUpdate(CreateRoleDtoSchema).extend({
  /** Layer-2 per-domain scope override for this role (Phase 2). */
  scopeConfig: ScopeConfigSchema.optional(),
  /** Layer-3 data-type (KPI category) allowlist for this role (Phase 3). */
  dataTypeConfig: DataTypeConfigSchema.optional(),
  /** Layer-4 data limits (history window / row + export caps) for this role (Phase 4). */
  dataLimits: DataLimitsConfigSchema.optional(),
  /** Layer-5 page-access allow/deny lists for this role (Phase 7). */
  pageAccess: PageAccessConfigSchema.optional(),
});
export type UpdateRoleDto = z.infer<typeof UpdateRoleDtoSchema>;
