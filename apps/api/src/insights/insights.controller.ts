import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { KPIInsight } from '@kpi-nexus/db';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { InsightsService } from './insights.service.js';
import { InsightsProducer } from './insights.producer.js';

const GenerateSchema = z.object({ kpiId: z.string().trim().min(1) }).strict();
const BatchSchema = z
  .object({
    thresholdChangePct: z.number().min(0).max(1000).optional(),
    topN: z.number().int().min(1).max(50).optional(),
  })
  .strict();

@Controller('insights')
export class InsightsController {
  constructor(
    private readonly insights: InsightsService,
    private readonly producer: InsightsProducer,
  ) {}

  @Get()
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  list(
    @Query('kpiId') kpiId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<KPIInsight[]> {
    return this.insights.list({
      kpiId: kpiId || undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Post('generate')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  async generate(@Body() body: unknown): Promise<{ insight: KPIInsight | null }> {
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'kpiId is required' });
    return { insight: await this.insights.generate(parsed.data.kpiId) };
  }

  @Post('generate-batch')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  async generateBatch(@Body() body: unknown): Promise<{ insights: KPIInsight[] }> {
    const parsed = BatchSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid batch request', details: parsed.error.flatten() });
    return { insights: await this.insights.generateBatch(parsed.data) };
  }

  @Post('schedule-daily')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  scheduleDaily(): Promise<{ scheduled: true; pattern: string }> {
    return this.producer.scheduleDaily();
  }
}
