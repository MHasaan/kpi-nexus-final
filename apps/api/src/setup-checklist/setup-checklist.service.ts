import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  type ChecklistItem,
  type ChecklistStatus,
  countComplete,
  isValidTaskKey,
  mergeChecklist,
} from './setup-checklist.defaults.js';

export interface ChecklistView {
  items: ChecklistItem[];
  total: number;
  complete: number;
}

/**
 * Post-onboarding setup checklist. Lazily upserted: a fresh org's GET returns 14
 * pending tasks without persisting any rows; only a status change writes a row.
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
    const items = mergeChecklist(rows);
    return { items, total: items.length, complete: countComplete(items) };
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
