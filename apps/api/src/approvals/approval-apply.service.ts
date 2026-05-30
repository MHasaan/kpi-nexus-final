import { BadRequestException, Injectable } from '@nestjs/common';
import type { ApprovalEntityType } from '@kpi-nexus/db';

import { KpiTargetsService } from '../kpi-targets/kpi-targets.service.js';
import { KpisService } from '../kpis/kpis.service.js';
import { RolesService } from '../roles/roles.service.js';

export interface ApplicableRequest {
  entityType: ApprovalEntityType;
  entityId: string;
  proposedPayload: unknown;
}

const BYPASS = { bypassApproval: true } as const;

/**
 * Replays an approved ApprovalRequest against the owning domain service. Always
 * passes `bypassApproval` so the replay does not re-enter the gate. Kept in the
 * main ApprovalsModule (which imports the domain modules) — the gate side lives
 * in the standalone ApprovalGateModule to avoid a circular dependency.
 */
@Injectable()
export class ApprovalApplyService {
  constructor(
    private readonly kpis: KpisService,
    private readonly kpiTargets: KpiTargetsService,
    private readonly roles: RolesService,
  ) {}

  async apply(request: ApplicableRequest): Promise<void> {
    const payload = request.proposedPayload as Record<string, unknown>;
    switch (request.entityType) {
      case 'KPI_DEFINITION':
        await this.kpis.update(request.entityId, payload as never, BYPASS);
        return;
      case 'ROLE_PERMISSIONS':
        await this.roles.update(request.entityId, payload as never, BYPASS);
        return;
      case 'KPI_TARGET': {
        const kind = payload?.kind;
        if (kind === 'create' && typeof payload.kpiId === 'string') {
          await this.kpiTargets.create(payload.kpiId, payload.dto as never, BYPASS);
          return;
        }
        if (kind === 'update' && typeof payload.targetId === 'string') {
          await this.kpiTargets.update(payload.targetId, payload.dto as never, BYPASS);
          return;
        }
        throw new BadRequestException({ code: 'INVALID_APPROVAL_PAYLOAD', message: 'KPI_TARGET payload missing kind/ids' });
      }
      default:
        throw new BadRequestException({ code: 'UNKNOWN_ENTITY_TYPE', message: `Cannot apply approval for ${request.entityType}` });
    }
  }
}
