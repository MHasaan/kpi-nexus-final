import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { DemoDataService, type SeedResult } from './demo-data.service.js';

@Controller('demo-data')
export class DemoDataController {
  constructor(private readonly demoData: DemoDataService) {}

  /** Seed a sample dataset into the caller's org (idempotent). */
  @Post('seed')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.CREATED)
  seed(): Promise<SeedResult> {
    return this.demoData.seed();
  }
}
