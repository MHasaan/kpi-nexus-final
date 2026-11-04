import { NotFoundException } from '@nestjs/common';
import type { KPIInsight } from '@kpi-nexus/db';
import { describe, expect, test, vi } from 'vitest';

import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { InsightsController } from './insights.controller.js';
import type { InsightsProducer } from './insights.producer.js';
import type { InsightsService } from './insights.service.js';

// BE-004 (+ BE-025): generating an insight returned AI commentary about any KPI
// id — including KPIs the caller can't see, or another tenant's (201
// {insight:null}). The HTTP layer now gates on the caller's KPI visibility; the
// daily batch job (system context) calls the service directly and is unaffected.
function make(visible: string[]) {
  const insight = (kpiId: string) => ({ id: `ins_${kpiId}`, kpiId }) as unknown as KPIInsight;
  const service = {
    generate: vi.fn(async (kpiId: string) => insight(kpiId)),
    generateBatch: vi.fn(async () => [insight('k_visible'), insight('k_hidden')]),
  };
  const access = {
    isKpiVisible: vi.fn(async (id: string) => visible.includes(id)),
    visibleKpiIds: vi.fn(async () => visible),
  };
  const controller = new InsightsController(
    service as unknown as InsightsService,
    {} as InsightsProducer,
    access as unknown as AccessContextService,
  );
  return { controller, service };
}

describe('InsightsController — KPI visibility gate (BE-004, BE-025)', () => {
  test('generate for a KPI the caller cannot see (or another tenant\'s) → 404, nothing generated', async () => {
    const { controller, service } = make(['k_visible']);
    await expect(controller.generate({ kpiId: 'k_hidden' })).rejects.toBeInstanceOf(NotFoundException);
    expect(service.generate).not.toHaveBeenCalled();
  });

  test('generate for a visible KPI works as before', async () => {
    const { controller } = make(['k_visible']);
    await expect(controller.generate({ kpiId: 'k_visible' })).resolves.toEqual({ insight: { id: 'ins_k_visible', kpiId: 'k_visible' } });
  });

  test('generate-batch returns only insights about visible KPIs', async () => {
    const { controller } = make(['k_visible']);
    const r = await controller.generateBatch({});
    expect(r.insights.map((i) => i.kpiId)).toEqual(['k_visible']);
  });
});
