import { describe, expect, test } from 'vitest';

import { DataLimitsConfigSchema } from '@kpi-nexus/contracts';

import { UpdateConnectorDtoSchema } from '../connectors/dto/connector.dto.js';
import { UpdateDashboardDtoSchema } from '../dashboards/dto/dashboard.dto.js';
import { UpdateKpiCategoryDtoSchema } from '../kpi-categories/dto/kpi-category.dto.js';
import { UpdateKpiTargetDtoSchema } from '../kpi-targets/kpi-target.validation.js';
import { UpdateThresholdBandDtoSchema } from '../kpi-threshold-bands/dto/threshold-band.dto.js';
import { UpdateKpiDtoSchema } from '../kpis/dto/create-kpi.dto.js';
import { UpdateKeyResultDtoSchema, UpdateObjectiveDtoSchema } from '../okrs/dto/okr.dto.js';
import { UpdateDimensionDtoSchema, UpdateTypeDtoSchema } from '../org-structure/dto/org-structure.dto.js';
import { UpdateOrgUnitDtoSchema } from '../org-units/dto/create-org-unit.dto.js';
import { UpdatePositionDtoSchema } from '../positions/dto/create-position.dto.js';
import { UpdateRoleDtoSchema } from '../roles/dto/update-role.dto.js';
import { UpdateTaskDtoSchema } from '../tasks/dto/task.dto.js';
import { UpdateWorkflowDtoSchema } from '../workflows/dto/workflow.dto.js';

// Zod 4 applies a field's .default() even inside .partial(); Zod 3 left an
// omitted field undefined. An update DTO built as Create.partial() then fills
// every create default, so `PATCH /roles/:id { scopeConfig }` wiped the role's
// permissions and a KPI PATCH reset its defaults. An update must carry only
// what the client sent.
const UPDATE_SCHEMAS = {
  UpdateConnectorDtoSchema,
  UpdateDashboardDtoSchema,
  UpdateDimensionDtoSchema,
  UpdateKeyResultDtoSchema,
  UpdateKpiCategoryDtoSchema,
  UpdateKpiDtoSchema,
  UpdateKpiTargetDtoSchema,
  UpdateObjectiveDtoSchema,
  UpdateOrgUnitDtoSchema,
  UpdatePositionDtoSchema,
  UpdateRoleDtoSchema,
  UpdateTaskDtoSchema,
  UpdateThresholdBandDtoSchema,
  UpdateTypeDtoSchema,
  UpdateWorkflowDtoSchema,
  DataLimitsConfigSchema,
};

describe('update DTOs add nothing the client did not send', () => {
  test.each(Object.entries(UPDATE_SCHEMAS))('%s parses {} to {}', (_name, schema) => {
    expect(schema.parse({})).toEqual({});
  });

  test('a role PATCH with only scopeConfig keeps permissions untouched', () => {
    expect(UpdateRoleDtoSchema.parse({ scopeConfig: { KPIS: 'UNITS' } })).toEqual({ scopeConfig: { KPIS: 'UNITS' } });
  });
});
