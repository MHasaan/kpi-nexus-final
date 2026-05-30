import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { AnomalyDetection, Forecast } from '@kpi-nexus/db';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { AnomalyService } from './anomaly.service.js';
import { ForecastsService } from './forecasts.service.js';
import { WhatIfService } from './whatif.service.js';

const DetectSchema = z
  .object({
    method: z.enum(['ensemble', 'isolation_forest', 'zscore', 'ewma']).optional(),
    threshold: z.number().positive().max(20).optional(),
    persist: z.boolean().optional(),
  })
  .strict();

const ForecastSchema = z
  .object({ horizon: z.number().int().min(1).max(365), model: z.string().trim().min(1).optional() })
  .strict();

const ScenarioSchema = z
  .object({
    deltaPct: z.number().optional(),
    deltaAbsolute: z.number().optional(),
    mechanic: z.enum(['additive', 'multiplicative']).optional(),
    floor: z.number().optional(),
    ceiling: z.number().optional(),
  })
  .strict();

const WhatIfSchema = z
  .object({ scenarios: z.array(ScenarioSchema).min(1).max(20), baselineCount: z.number().int().min(1).max(365).optional() })
  .strict();

/** ML-backed analytics for a KPI: anomalies, forecasts, what-if. */
@Controller('kpis/:kpiId')
export class AnalyticsController {
  constructor(
    private readonly anomaly: AnomalyService,
    private readonly forecasts: ForecastsService,
    private readonly whatif: WhatIfService,
  ) {}

  @Get('anomalies')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  listAnomalies(
    @Param('kpiId') kpiId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('isConfirmed') isConfirmed?: string,
  ): Promise<AnomalyDetection[]> {
    return this.anomaly.list(kpiId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      isConfirmed: isConfirmed === undefined ? undefined : isConfirmed === 'true',
    });
  }

  @Post('anomalies/detect')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  detect(@Param('kpiId') kpiId: string, @Body() body: unknown) {
    const parsed = DetectSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid detect request', details: parsed.error.flatten() });
    return this.anomaly.detect(kpiId, parsed.data);
  }

  @Patch('anomalies/:id/confirm')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  confirm(@Param('kpiId') kpiId: string, @Param('id') id: string): Promise<AnomalyDetection> {
    return this.anomaly.confirm(kpiId, id);
  }

  @Get('forecasts')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  listForecasts(@Param('kpiId') kpiId: string, @Query('model') model?: string): Promise<Forecast[]> {
    return this.forecasts.list(kpiId, model || undefined);
  }

  @Post('forecasts')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  forecast(@Param('kpiId') kpiId: string, @Body() body: unknown): Promise<Forecast> {
    const parsed = ForecastSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'horizon is required (1-365)', details: parsed.error.flatten() });
    return this.forecasts.forecast(kpiId, parsed.data);
  }

  @Post('whatif')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  simulate(@Param('kpiId') kpiId: string, @Body() body: unknown) {
    const parsed = WhatIfSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'scenarios required', details: parsed.error.flatten() });
    return this.whatif.simulate(kpiId, parsed.data);
  }
}
