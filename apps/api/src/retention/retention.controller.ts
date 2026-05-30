import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type PublicRetentionPolicy, RetentionService } from './retention.service.js';
import type { RetentionTier } from './retention-tiers.js';

const ApplyTierDtoSchema = z.object({ tier: z.enum(['FREE', 'PRO', 'ENTERPRISE']) }).strict();

@Controller('retention-policies')
@RequirePermissions(PermissionKey.ORG_SETTINGS)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get()
  list(): Promise<PublicRetentionPolicy[]> {
    return this.retention.list();
  }

  @Get('tiers/list')
  tiers(): Array<{ tier: RetentionTier; days: number }> {
    return this.retention.listTiers();
  }

  @Post('apply-tier')
  @HttpCode(HttpStatus.OK)
  applyTier(@Body() body: unknown): Promise<PublicRetentionPolicy[]> {
    const parsed = ApplyTierDtoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'tier must be FREE|PRO|ENTERPRISE' });
    return this.retention.applyTier(parsed.data.tier);
  }
}
