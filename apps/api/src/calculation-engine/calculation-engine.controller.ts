import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { CalculationEngineService } from './calculation-engine.service.js';
import { CalculationEngineProducer } from './calculation-engine.producer.js';

const RollupBodySchema = z
  .object({
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
  })
  .strict();

/**
 * Synchronous calc-engine triggers — run the same service methods the BullMQ
 * processor uses, returning the resulting value. Used for manual "recompute now"
 * and deterministic e2e. Both also enqueue transitive propagation.
 */
@Controller('kpis/:kpiId')
export class CalculationEngineController {
  constructor(
    private readonly engine: CalculationEngineService,
    private readonly producer: CalculationEngineProducer,
  ) {}

  @Post('recompute')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.OK)
  async recompute(@Param('kpiId') kpiId: string): Promise<{ value: number | null }> {
    const ctx = RequestContextStore.require();
    const { value, dependents } = await this.engine.recomputeKpi(kpiId);
    for (const dep of dependents) {
      await this.producer.enqueueRecompute({ organizationId: ctx.organizationId, kpiId: dep });
    }
    return { value };
  }

  @Post('rollup')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.OK)
  async rollup(@Param('kpiId') kpiId: string, @Body() body: unknown): Promise<{ value: number | null }> {
    const ctx = RequestContextStore.require();
    const parsed = RollupBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid period', details: { issues: parsed.error.issues } });
    }
    // Default to an all-time window so a manual trigger rolls up everything to date.
    const periodStart = parsed.data.periodStart ?? new Date(0);
    const periodEnd = parsed.data.periodEnd ?? new Date();
    const { value, parents } = await this.engine.rollupParent(kpiId, periodStart, periodEnd);
    for (const parent of parents) {
      await this.producer.enqueueCascadeRollup({
        organizationId: ctx.organizationId,
        parentKpiId: parent,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    }
    return { value };
  }
}
