import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@kpi-nexus/db';

@Injectable()
export class DbHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbHealthService.name);
  private readonly prisma = new PrismaClient();

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
