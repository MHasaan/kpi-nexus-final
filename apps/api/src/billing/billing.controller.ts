import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequireAnyPermission } from '../rbac/decorators/require-permissions.decorator.js';
import { BillingService, type BillingPlan, type BillingStatus } from './billing.service.js';
import { ApiBody } from '../openapi/api-body.decorator.js';

const SetPlanSchema = z.object({ planKey: z.string().trim().min(1) }).strict();

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequireAnyPermission(PermissionKey.BILLING_MANAGE, PermissionKey.ORG_SETTINGS)
  status(): Promise<BillingStatus> {
    return this.billing.getStatus();
  }

  @Get('plans')
  @RequireAnyPermission(PermissionKey.BILLING_MANAGE, PermissionKey.ORG_SETTINGS)
  plans(): Promise<BillingPlan[]> {
    return this.billing.listPlans();
  }

  @Post('plan')
  @RequireAnyPermission(PermissionKey.BILLING_MANAGE, PermissionKey.ORG_SETTINGS)
  @ApiBody(SetPlanSchema)
  setPlan(@Body() body: unknown): Promise<BillingStatus> {
    const parsed = SetPlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'planKey is required' });
    }
    return this.billing.setPlan(parsed.data.planKey);
  }
}
