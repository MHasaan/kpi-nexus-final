import { Module } from '@nestjs/common';

import { DbHealthService } from './db-health.service.js';
import { HealthController } from './health.controller.js';
import { RedisHealthService } from './redis-health.service.js';

@Module({
  controllers: [HealthController],
  providers: [DbHealthService, RedisHealthService],
})
export class HealthModule {}
