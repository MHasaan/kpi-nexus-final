import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

export interface PlatformAdminRow {
  userId: string;
  email: string;
  fullName: string;
  grantedAt: Date;
  grantedBy: string;
}

/**
 * Platform admins are GLOBAL (cross-tenant) operators — the PlatformAdmin table
 * is not org-scoped. Bootstrapping: while the table is empty, any authenticated
 * user may grant the first admin (see PlatformAdminGuard); thereafter only
 * existing platform admins may manage the set.
 */
@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  // PlatformAdmin is not a tenant table: under RLS only kpi_system can read or
  // write it, so every access runs on the system connection (OT-014). Callers
  // are gated by PlatformAdminGuard.
  private system<T>(reason: string, fn: () => Promise<T>): Promise<T> {
    return Promise.resolve(RequestContextStore.runWithBypass(reason, fn));
  }

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const row = await this.system('platform-admin-check', () =>
      this.prisma.platformAdmin.findUnique({ where: { userId }, select: { userId: true } }),
    );
    return row !== null;
  }

  count(): Promise<number> {
    return this.system('platform-admin-count', () => this.prisma.platformAdmin.count());
  }

  async list(): Promise<PlatformAdminRow[]> {
    // Platform admins belong to many tenants; the joined User rows are
    // cross-tenant by design (OT-014).
    const rows = await this.system('platform-admin-list', () =>
      this.prisma.platformAdmin.findMany({
        include: { user: { select: { email: true, fullName: true } } },
        orderBy: { grantedAt: 'asc' },
      }),
    );
    return rows.map((r) => ({
      userId: r.userId,
      email: r.user.email,
      fullName: r.user.fullName,
      grantedAt: r.grantedAt,
      grantedBy: r.grantedBy,
    }));
  }

  async grant(userId: string, grantedBy: string): Promise<{ userId: string }> {
    return this.system('platform-admin-grant', () =>
      this.prisma.platformAdmin.upsert({
        where: { userId },
        create: { userId, grantedBy },
        update: {},
        select: { userId: true },
      }),
    );
  }

  async revoke(userId: string): Promise<void> {
    await this.system('platform-admin-revoke', () => this.prisma.platformAdmin.deleteMany({ where: { userId } }));
  }
}
