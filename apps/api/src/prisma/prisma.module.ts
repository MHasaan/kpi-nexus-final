import { Global, Logger, Module } from '@nestjs/common';

import { RequestContextStore } from '../tenancy/request-context.js';
import { PrismaService } from './prisma.service.js';
import { createTenantPrisma, rlsEnforced } from './tenant-prisma.js';

/**
 * PrismaService for the whole API.
 *
 * - RLS_ENFORCED unset/false: a plain PrismaService on DATABASE_URL — the
 *   pre-OT-014 behaviour, unchanged.
 * - RLS_ENFORCED=true: requests go through `kpi_app` (DATABASE_URL_APP) with the
 *   org set per transaction, and bypass work through `kpi_system`
 *   (DATABASE_URL_SYSTEM) — see tenant-prisma.ts. Missing URLs fail the boot
 *   rather than silently running unenforced.
 */
export function prismaServiceFactory(env: Record<string, string | undefined> = process.env): PrismaService {
  const logger = new Logger('PrismaModule');
  if (!rlsEnforced(env)) {
    logger.warn('Row-level security NOT enforced (RLS_ENFORCED != true) — tenant isolation relies on query filters only');
    return new PrismaService();
  }
  const appUrl = env.DATABASE_URL_APP;
  const systemUrl = env.DATABASE_URL_SYSTEM;
  if (!appUrl || !systemUrl) {
    throw new Error('RLS_ENFORCED=true requires DATABASE_URL_APP (kpi_app) and DATABASE_URL_SYSTEM (kpi_system)');
  }
  logger.log('Row-level security enforced: requests as kpi_app, system work as kpi_system');
  return createTenantPrisma(new PrismaService(appUrl), new PrismaService(systemUrl), () => {
    const ctx = RequestContextStore.get();
    return ctx ? { organizationId: ctx.organizationId, bypassRls: ctx.bypassRls === true } : undefined;
  });
}

@Global()
@Module({
  providers: [{ provide: PrismaService, useFactory: () => prismaServiceFactory() }],
  exports: [PrismaService],
})
export class PrismaModule {}
