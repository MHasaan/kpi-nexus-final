import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, prismaAdapter } from '@kpi-nexus/db';

import { rlsEnforced } from '../prisma/tenant-prisma.js';

@Injectable()
export class DbHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbHealthService.name);
  // With RLS enforced the ping uses the request role too, so the running API
  // never opens an owner connection (OT-014).
  private readonly prisma = new PrismaClient({
    adapter: prismaAdapter(rlsEnforced() && process.env.DATABASE_URL_APP ? process.env.DATABASE_URL_APP : undefined),
  });

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$connect();
    } catch (error) {
      this.logger.warn(`Initial DB connection failed: ${String(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
