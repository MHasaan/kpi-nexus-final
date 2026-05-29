import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';

export interface OffboardOptions {
  transferKpisTo?: string;
  reparentDirectReportsTo?: string;
  leaveReason?: 'TRANSFERRED' | 'PROMOTED' | 'LEFT_ORG' | 'STRUCTURE_CHANGE';
  archive?: boolean; // default true
}

export interface OffboardSummary {
  kpisTransferred: number;
  reportsReparented: number;
  unitsVacated: number;
  membershipsClosed: number;
  archived: boolean;
}

@Injectable()
export class OffboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async offboard(userId: string, opts: OffboardOptions): Promise<OffboardSummary> {
    const ctx = RequestContextStore.require();

    const target = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!target) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    if (target.status === 'PURGED' || target.status === 'DELETED') {
      throw new UnprocessableEntityException({ code: 'ALREADY_GONE', message: `User is ${target.status}` });
    }
    if (opts.reparentDirectReportsTo === userId) {
      throw new BadRequestException({ code: 'SELF_REPARENT', message: 'Cannot reparent reports to the departing user' });
    }
    await this.assertActiveTarget(opts.transferKpisTo, 'transferKpisTo');
    await this.assertActiveTarget(opts.reparentDirectReportsTo, 'reparentDirectReportsTo');

    const archive = opts.archive !== false;
    const leaveReason = opts.leaveReason ?? 'LEFT_ORG';

    const summary = await this.prisma.$transaction(async (tx) => {
      const kpis = await tx.kPI.updateMany({
        where: { organizationId: ctx.organizationId, ownerUserId: userId },
        data: { ownerUserId: opts.transferKpisTo ?? null },
      });
      const reports = await tx.user.updateMany({
        where: { organizationId: ctx.organizationId, managerId: userId },
        data: { managerId: opts.reparentDirectReportsTo ?? null },
      });
      const units = await tx.orgUnit.updateMany({
        where: { organizationId: ctx.organizationId, headUserId: userId },
        data: { headUserId: null },
      });
      const memberships = await tx.orgUnitMember.updateMany({
        where: { userId, leftAt: null, orgUnit: { organizationId: ctx.organizationId } },
        data: { leftAt: new Date(), leaveReason },
      });
      if (archive) {
        await tx.user.update({ where: { id: userId }, data: { status: 'ARCHIVED' } });
        await tx.refreshToken.deleteMany({ where: { userId } });
      }
      return {
        kpisTransferred: kpis.count,
        reportsReparented: reports.count,
        unitsVacated: units.count,
        membershipsClosed: memberships.count,
        archived: archive,
      };
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'User',
      entityId: userId,
      metadata: { offboard: true, ...summary, transferKpisTo: opts.transferKpisTo, reparentDirectReportsTo: opts.reparentDirectReportsTo },
    });
    return summary;
  }

  private async assertActiveTarget(targetId: string | undefined, field: string): Promise<void> {
    if (!targetId) return;
    const ctx = RequestContextStore.require();
    const t = await this.prisma.user.findFirst({
      where: { id: targetId, organizationId: ctx.organizationId },
      select: { status: true },
    });
    if (!t) {
      throw new BadRequestException({ code: 'INVALID_TARGET', message: `${field} is not a member of this organization` });
    }
    if (t.status !== 'ACTIVE') {
      throw new UnprocessableEntityException({ code: 'INACTIVE_TARGET', message: `${field} must be an ACTIVE user (is ${t.status})` });
    }
  }
}
