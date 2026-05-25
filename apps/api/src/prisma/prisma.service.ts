import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, setTenantContextResolver } from '@kpi-nexus/db';

import { resolveTenantContextForDb } from '../tenancy/request-context.js';

/**
 * DI-friendly PrismaClient. Extends the underlying class so consumers get
 * the full Prisma API via `this.user.findUnique(...)` etc.
 *
 * On `onModuleInit` we wire the tenant-context resolver from the api's
 * AsyncLocalStorage into packages/db so the Prisma middleware can set
 * Postgres GUCs (`app.current_org`, `app.bypass_rls`) for RLS.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
    });
  }

  async onModuleInit(): Promise<void> {
    setTenantContextResolver(resolveTenantContextForDb);
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
    } catch (error) {
      this.logger.error(`Prisma initial $connect failed: ${String(error)}`);
      // Don't throw — let /health surface the down state so the app still boots
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
