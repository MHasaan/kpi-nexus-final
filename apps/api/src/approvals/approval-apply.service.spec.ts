/**
 * ApprovalApplyService unit tests. Dispatches an approved request to the right
 * domain service with bypassApproval:true so the replay does not re-trigger the
 * gate. Covers each entityType + the create/update discriminator for targets.
 */
import { describe, expect, test, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';

import type { KpiTargetsService } from '../kpi-targets/kpi-targets.service.js';
import type { KpisService } from '../kpis/kpis.service.js';
import type { RolesService } from '../roles/roles.service.js';
import { ApprovalApplyService } from './approval-apply.service.js';

function makeService() {
  const kpis = { update: vi.fn(async () => ({ id: 'kpi_1' })) };
  const roles = { update: vi.fn(async () => ({ id: 'role_1' })) };
  const targets = { create: vi.fn(async () => ({ id: 't_new' })), update: vi.fn(async () => ({ id: 't_1' })) };
  const service = new ApprovalApplyService(
    kpis as unknown as KpisService,
    targets as unknown as KpiTargetsService,
    roles as unknown as RolesService,
  );
  return { service, kpis, roles, targets };
}

describe('ApprovalApplyService.apply', () => {
  test('KPI_DEFINITION → kpis.update with bypassApproval', async () => {
    const { service, kpis } = makeService();
    await service.apply({ entityType: 'KPI_DEFINITION', entityId: 'kpi_1', proposedPayload: { name: 'New name' } });
    expect(kpis.update).toHaveBeenCalledWith('kpi_1', { name: 'New name' }, { bypassApproval: true });
  });

  test('ROLE_PERMISSIONS → roles.update with bypassApproval', async () => {
    const { service, roles } = makeService();
    await service.apply({ entityType: 'ROLE_PERMISSIONS', entityId: 'role_1', proposedPayload: { permissions: ['KPI_VIEW'] } });
    expect(roles.update).toHaveBeenCalledWith('role_1', { permissions: ['KPI_VIEW'] }, { bypassApproval: true });
  });

  test('KPI_TARGET create → targets.create with kpiId + dto', async () => {
    const { service, targets } = makeService();
    await service.apply({
      entityType: 'KPI_TARGET',
      entityId: 'kpi_9',
      proposedPayload: { kind: 'create', kpiId: 'kpi_9', dto: { type: 'SIMPLE', value: 100 } },
    });
    expect(targets.create).toHaveBeenCalledWith('kpi_9', { type: 'SIMPLE', value: 100 }, { bypassApproval: true });
  });

  test('KPI_TARGET update → targets.update with targetId + dto', async () => {
    const { service, targets } = makeService();
    await service.apply({
      entityType: 'KPI_TARGET',
      entityId: 't_1',
      proposedPayload: { kind: 'update', targetId: 't_1', dto: { value: 200 } },
    });
    expect(targets.update).toHaveBeenCalledWith('t_1', { value: 200 }, { bypassApproval: true });
  });

  test('KPI_TARGET with bad payload (no kind) → BadRequest', async () => {
    const { service } = makeService();
    await expect(
      service.apply({ entityType: 'KPI_TARGET', entityId: 'x', proposedPayload: { value: 1 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('unknown entityType → BadRequest', async () => {
    const { service } = makeService();
    await expect(
      service.apply({ entityType: 'NONSENSE' as 'KPI_DEFINITION', entityId: 'x', proposedPayload: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
