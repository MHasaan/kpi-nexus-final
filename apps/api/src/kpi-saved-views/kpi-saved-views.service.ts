import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateKpiSavedViewDto, UpdateKpiSavedViewDto } from './dto/kpi-saved-view.dto.js';

const viewSelect = {
  id: true,
  userId: true,
  name: true,
  filters: true,
  isShared: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.KPISavedViewSelect;

type ViewRow = Prisma.KPISavedViewGetPayload<{ select: typeof viewSelect }>;
export type PublicKpiSavedView = ViewRow & { mine: boolean };

/**
 * Saved views on the KPI list. A view stores filters, not KPIs, so whoever
 * opens one still sees only the KPIs visible to them; that is why a view can
 * be shared with the organization. Only its owner (or an admin, for delete)
 * changes it.
 */
@Injectable()
export class KpiSavedViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContextService,
  ) {}

  private present(row: ViewRow, userId: string): PublicKpiSavedView {
    return { ...row, mine: row.userId === userId };
  }

  /** Mine plus the ones shared in my organization. */
  async list(): Promise<PublicKpiSavedView[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.kPISavedView.findMany({
      where: { organizationId: ctx.organizationId, OR: [{ userId: ctx.userId }, { isShared: true }] },
      select: viewSelect,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.present(r, ctx.userId));
  }

  async create(dto: CreateKpiSavedViewDto): Promise<PublicKpiSavedView> {
    const ctx = RequestContextStore.require();
    try {
      const row = await this.prisma.kPISavedView.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          name: dto.name,
          filters: dto.filters as Prisma.InputJsonValue,
          isShared: dto.isShared,
        },
        select: viewSelect,
      });
      return this.present(row, ctx.userId);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'CONFLICT', message: `You already have a view named "${dto.name}"` });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateKpiSavedViewDto): Promise<PublicKpiSavedView> {
    const ctx = RequestContextStore.require();
    await this.requireOwned(id, { allowAdmin: false });
    try {
      const row = await this.prisma.kPISavedView.update({
        where: { id },
        data: {
          name: dto.name,
          filters: dto.filters as Prisma.InputJsonValue | undefined,
          isShared: dto.isShared,
        },
        select: viewSelect,
      });
      return this.present(row, ctx.userId);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'CONFLICT', message: `You already have a view named "${dto.name ?? ''}"` });
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.requireOwned(id, { allowAdmin: true });
    await this.prisma.kPISavedView.delete({ where: { id } });
  }

  /** 404 unless the caller can see it (theirs or shared, same org); 403 unless they own it. */
  private async requireOwned(id: string, opts: { allowAdmin: boolean }): Promise<void> {
    const ctx = RequestContextStore.require();
    const row = await this.prisma.kPISavedView.findFirst({
      where: { id, organizationId: ctx.organizationId, OR: [{ userId: ctx.userId }, { isShared: true }] },
      select: { userId: true },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Saved view not found' });
    if (row.userId === ctx.userId) return;
    if (opts.allowAdmin && (await this.accessContext.resolveForCurrentPrincipal()).isAdmin) return;
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the owner can change this view' });
  }
}
