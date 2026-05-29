import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { Recommendation, RecommendationStatus } from '@kpi-nexus/db';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { RecommendationsService } from './recommendations.service.js';

const GenerateSchema = z
  .object({
    kpiId: z.string().trim().min(1).optional(),
    alertId: z.string().trim().min(1).optional(),
    anomalyId: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((v) => v.kpiId || v.alertId, { message: 'kpiId or alertId is required' });

const StatusSchema = z.object({ status: z.enum(['ACTIONED', 'DISMISSED']) }).strict();

@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  list(
    @Query('kpiId') kpiId?: string,
    @Query('alertId') alertId?: string,
    @Query('status') status?: string,
  ): Promise<Recommendation[]> {
    return this.recommendations.list({
      kpiId: kpiId || undefined,
      alertId: alertId || undefined,
      status: status ? (status as RecommendationStatus) : undefined,
    });
  }

  @Post('generate')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  generate(@Body() body: unknown): Promise<Recommendation> {
    const parsed = GenerateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'kpiId or alertId is required' });
    return this.recommendations.generate(parsed.data);
  }

  @Patch(':id/status')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  updateStatus(@Param('id') id: string, @Body() body: unknown): Promise<Recommendation> {
    const parsed = StatusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'status must be ACTIONED or DISMISSED' });
    return this.recommendations.updateStatus(id, parsed.data.status);
  }
}
