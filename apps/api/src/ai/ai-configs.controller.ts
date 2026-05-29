import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Put } from '@nestjs/common';
import {
  AiFeatureSchema,
  AiProviderKeySchema,
  CircuitBreakerModeSchema,
  PermissionKey,
} from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { AiBudgetService, type SpendSnapshot } from './ai-budget.service.js';
import { AiConfigsService, type FeatureConfigView } from './ai-configs.service.js';

const UpsertConfigSchema = z
  .object({
    providerId: AiProviderKeySchema,
    model: z.string().trim().min(1),
    fallbackProviderId: AiProviderKeySchema.optional(),
    fallbackModel: z.string().trim().min(1).optional(),
    perFeatureCapUsd: z.number().nonnegative().optional(),
  })
  .strict();

const UpdateBudgetSchema = z
  .object({
    dailyCapUsd: z.number().nonnegative().optional(),
    monthlyCapUsd: z.number().nonnegative().optional(),
    circuitBreaker: CircuitBreakerModeSchema.optional(),
  })
  .strict();

/** AI per-feature routing config + spend budget. All gated by ORG_SETTINGS. */
@Controller('ai')
export class AiConfigsController {
  constructor(
    private readonly configs: AiConfigsService,
    private readonly budget: AiBudgetService,
  ) {}

  @Get('configs')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  listConfigs(): Promise<FeatureConfigView[]> {
    return this.configs.list();
  }

  @Put('configs/:feature')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  upsertConfig(@Param('feature') feature: string, @Body() body: unknown): Promise<FeatureConfigView> {
    const f = AiFeatureSchema.safeParse(feature);
    if (!f.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Unknown AI feature '${feature}'` });
    const parsed = UpsertConfigSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid AI config', details: parsed.error.flatten() });
    return this.configs.upsertConfig(f.data, parsed.data);
  }

  @Delete('configs/:feature')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  async deleteConfig(@Param('feature') feature: string): Promise<{ reverted: true }> {
    const f = AiFeatureSchema.safeParse(feature);
    if (!f.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Unknown AI feature '${feature}'` });
    await this.configs.deleteConfig(f.data);
    return { reverted: true };
  }

  @Get('budget')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  getBudget(): Promise<SpendSnapshot> {
    return this.budget.getSpendSnapshot();
  }

  @Patch('budget')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  updateBudget(@Body() body: unknown): Promise<SpendSnapshot> {
    const parsed = UpdateBudgetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid budget update', details: parsed.error.flatten() });
    return this.budget.updateBudget(parsed.data);
  }
}
