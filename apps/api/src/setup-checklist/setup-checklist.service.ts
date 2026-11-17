import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  type ChecklistItem,
  type ChecklistStatus,
  countComplete,
  isValidTaskKey,
  resolveChecklist,
} from './setup-checklist.defaults.js';

export interface ChecklistView {
  items: ChecklistItem[];
  total: number;
  complete: number;
}

/**
 * Post-onboarding setup checklist. Lazily upserted: a fresh org's GET returns 14
 * pending tasks without persisting any rows; only a status change writes a row.
 * A task is also complete when the organisation has simply done it.
 */
@Injectable()
export class SetupChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ChecklistView> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.onboardingTask.findMany({
      where: { organizationId: ctx.organizationId },
      select: { key: true, status: true },
    });
    const items = resolveChecklist(rows, await this.detectDone(ctx.organizationId));
    return { items, total: items.length, complete: countComplete(items) };
  }

  /**
   * Which tasks are done because the work exists (plan 3.3). One cheap
   * existence check each, all scoped to the organisation. `compliance_review`
   * has nothing to detect: it is a thing a person reads, so it stays manual.
   */
  private async detectDone(organizationId: string): Promise<Set<string>> {
    const where = { organizationId };
    const exists = (row: unknown): boolean => row !== null;
    const [
      people,
      dataPoint,
      widget,
      channel,
      escalation,
      report,
      objective,
      connector,
      connection,
      adminWithoutMfa,
      adminCount,
      sso,
      aiConfig,
      domain,
      verifiedDomain,
    ] = await Promise.all([
      this.prisma.user.count({ where: { ...where, status: { in: ['INVITED', 'PENDING_VERIFICATION', 'ACTIVE'] } } }),
      this.prisma.kPIDataPoint.findFirst({ where, select: { id: true } }),
      this.prisma.dashboardWidget.findFirst({ where, select: { id: true } }),
      this.prisma.notificationChannel.findFirst({ where: { ...where, isActive: true }, select: { id: true } }),
      this.prisma.escalationRule.findFirst({ where, select: { id: true } }),
      this.prisma.scheduledReport.findFirst({ where: { ...where, isActive: true }, select: { id: true } }),
      this.prisma.objective.findFirst({ where, select: { id: true } }),
      this.prisma.connector.findFirst({ where: { ...where, isActive: true }, select: { id: true } }),
      this.prisma.integrationConnection.findFirst({ where: { ...where, status: 'CONNECTED' }, select: { id: true } }),
      this.prisma.user.findFirst({
        where: { ...where, status: 'ACTIVE', mfaEnabled: false, role: { isAdmin: true } },
        select: { id: true },
      }),
      this.prisma.user.count({ where: { ...where, status: 'ACTIVE', role: { isAdmin: true } } }),
      this.prisma.ssoConfig.findFirst({ where: { ...where, isActive: true }, select: { id: true } }),
      this.prisma.aiFeatureConfig.findFirst({ where, select: { id: true } }),
      this.prisma.customDomain.findFirst({ where, select: { id: true } }),
      this.prisma.customDomain.findFirst({ where: { ...where, verifiedAt: { not: null } }, select: { id: true } }),
    ]);

    const done = new Set<string>();
    if (people > 1) done.add('remaining_invites');
    if (exists(dataPoint)) done.add('historical_import');
    if (exists(widget)) done.add('default_dashboard');
    if (exists(channel)) done.add('channels');
    if (exists(escalation)) done.add('escalation');
    if (exists(report)) done.add('scheduled_report');
    if (exists(objective)) done.add('okrs');
    if (exists(connector) || exists(connection)) done.add('data_source');
    if (adminCount > 0 && !exists(adminWithoutMfa)) done.add('mfa');
    if (exists(sso)) done.add('sso');
    if (exists(aiConfig)) done.add('ai_tuning');
    if (exists(domain)) done.add('custom_domain');
    if (exists(verifiedDomain)) done.add('domain_verification');
    return done;
  }

  /** Flip a task to complete/dismissed/pending; 'pending' clears the row. */
  async markStatus(key: string, status: ChecklistStatus): Promise<ChecklistView> {
    if (!isValidTaskKey(key)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Unknown checklist task '${key}'` });
    }
    const ctx = RequestContextStore.require();

    if (status === 'pending') {
      // Reset = back to the default (no row needed).
      await this.prisma.onboardingTask
        .delete({ where: { organizationId_key: { organizationId: ctx.organizationId, key } } })
        .catch(() => undefined);
      return this.list();
    }

    const now = new Date();
    await this.prisma.onboardingTask.upsert({
      where: { organizationId_key: { organizationId: ctx.organizationId, key } },
      create: {
        organizationId: ctx.organizationId,
        key,
        status,
        completedAt: status === 'complete' ? now : null,
        completedById: status === 'complete' ? ctx.userId : null,
        dismissedAt: status === 'dismissed' ? now : null,
      },
      update: {
        status,
        completedAt: status === 'complete' ? now : null,
        completedById: status === 'complete' ? ctx.userId : null,
        dismissedAt: status === 'dismissed' ? now : null,
      },
    });
    return this.list();
  }
}
