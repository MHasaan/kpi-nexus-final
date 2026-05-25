import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { UpdateOrganizationDto } from './dto/update-organization.dto.js';

/** Subset returned to clients — strips internal billing/lifecycle fields. */
const orgSelect = {
  id: true,
  name: true,
  slug: true,
  tenantStatus: true,
  sizeTier: true,
  industry: true,
  type: true,
  logoUrl: true,
  faviconUrl: true,
  primaryColor: true,
  secondaryColor: true,
  timezone: true,
  currency: true,
  locale: true,
  dateFormat: true,
  numberFormat: true,
  weekStartsOn: true,
  fiscalCalendar: true,
  roleLabel: true,
  groupLabel: true,
  memberLabel: true,
  kpiLabel: true,
  dashboardLabel: true,
  scorecardLabel: true,
  objectiveLabel: true,
  taskLabel: true,
  dataResidency: true,
  complianceProfile: true,
  passwordPolicy: true,
  planKey: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMine(): Promise<unknown> {
    const ctx = RequestContextStore.require();
    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: orgSelect,
    });
    if (!org) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'organization not found' });
    }
    return org;
  }

  /**
   * Get just the terminology subset — used by the FE custom-label cache to
   * avoid sending the full org object on every page load.
   */
  async getTerminology(): Promise<{
    roleLabel: string;
    groupLabel: string;
    memberLabel: string;
    kpiLabel: string;
    dashboardLabel: string;
    scorecardLabel: string;
    objectiveLabel: string;
    taskLabel: string;
  }> {
    const ctx = RequestContextStore.require();
    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: {
        roleLabel: true,
        groupLabel: true,
        memberLabel: true,
        kpiLabel: true,
        dashboardLabel: true,
        scorecardLabel: true,
        objectiveLabel: true,
        taskLabel: true,
      },
    });
    if (!org) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'organization not found' });
    }
    return org;
  }

  async updateMine(dto: UpdateOrganizationDto): Promise<unknown> {
    const ctx = RequestContextStore.require();

    // Json fields need explicit Prisma typing — extract + cast separately.
    const { fiscalCalendar, passwordPolicy, ...rest } = dto;
    const data: Prisma.OrganizationUpdateInput = { ...rest };
    if (fiscalCalendar !== undefined) {
      data.fiscalCalendar = fiscalCalendar as Prisma.InputJsonValue;
    }
    if (passwordPolicy !== undefined) {
      data.passwordPolicy = passwordPolicy as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.organization.update({
      where: { id: ctx.organizationId },
      data,
      select: orgSelect,
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Organization',
      entityId: ctx.organizationId,
      changes: dto as Record<string, unknown>,
    });

    return updated;
  }
}
