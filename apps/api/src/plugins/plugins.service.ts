import { Injectable, NotFoundException } from '@nestjs/common';
import type { PluginType, Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { InstallPluginDto } from './dto/plugin.dto.js';

const pluginSelect = {
  id: true,
  organizationId: true,
  name: true,
  type: true,
  version: true,
  entryUrl: true,
  description: true,
  isEnabled: true,
  config: true,
  installedById: true,
  createdAt: true,
} satisfies Prisma.PluginSelect;

export type PublicPlugin = Prisma.PluginGetPayload<{ select: typeof pluginSelect }>;

@Injectable()
export class PluginsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(type?: PluginType): Promise<PublicPlugin[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.plugin.findMany({
      where: { organizationId: ctx.organizationId, ...(type ? { type } : {}) },
      select: pluginSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getById(id: string): Promise<PublicPlugin> {
    const ctx = RequestContextStore.require();
    const plugin = await this.prisma.plugin.findFirst({ where: { id, organizationId: ctx.organizationId }, select: pluginSelect });
    if (!plugin) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Plugin not found' });
    return plugin;
  }

  /** Register a plugin in the catalog. Sandbox execution lands in P9. */
  async install(dto: InstallPluginDto): Promise<PublicPlugin> {
    const ctx = RequestContextStore.require();
    const created = await this.prisma.plugin.create({
      data: {
        organizationId: ctx.organizationId,
        name: dto.name,
        type: dto.type as PluginType,
        version: dto.version,
        entryUrl: dto.entryUrl,
        description: dto.description,
        config: (dto.config ?? undefined) as Prisma.InputJsonValue | undefined,
        isEnabled: dto.isEnabled ?? true,
        installedById: ctx.userId,
      },
      select: pluginSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'Plugin', entityId: created.id, metadata: { name: created.name, type: created.type } });
    return created;
  }

  async setEnabled(id: string, isEnabled: boolean): Promise<PublicPlugin> {
    await this.getById(id);
    const updated = await this.prisma.plugin.update({ where: { id }, data: { isEnabled }, select: pluginSelect });
    await this.audit.record({ action: 'UPDATE', entityType: 'Plugin', entityId: id, metadata: { isEnabled } });
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.plugin.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'Plugin', entityId: id });
  }
}
