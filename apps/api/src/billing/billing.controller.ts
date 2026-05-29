import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { BillingService, type BillingStatus } from './billing.service.js';

const SetPlanSchema = z.object({ planKey: z.string().trim().min(1) }).strict();

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  status(): Promise<BillingStatus> {
    return this.billing.getStatus();
  }

  @Post('plan')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  setPlan(@Body() body: unknown): Promise<BillingStatus> {
    const parsed = SetPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'planKey is required' });
    }
    return this.billing.setPlan(parsed.data.planKey);
  }
}
