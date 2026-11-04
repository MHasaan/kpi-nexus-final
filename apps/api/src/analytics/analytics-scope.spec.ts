import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { requireAnalyticsKpi } from './analytics-scope.js';

describe('requireAnalyticsKpi (BE-004 ANALYTICS ceiling)', () => {
  it('passes when the KPI is visible and inside the ANALYTICS scope', async () => {
    const kpis = { getById: vi.fn(async () => ({ id: 'k1' })) };
    const ac = { isKpiAnalyticsAllowed: vi.fn(async () => true) };
    await expect(requireAnalyticsKpi(kpis as never, ac, 'k1')).resolves.toBeUndefined();
  });

  it('a visible KPI outside the ANALYTICS scope is a 404', async () => {
    const kpis = { getById: vi.fn(async () => ({ id: 'k1' })) };
    const ac = { isKpiAnalyticsAllowed: vi.fn(async () => false) };
    await expect(requireAnalyticsKpi(kpis as never, ac, 'k1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('an invisible KPI fails at the KPI gate before the analytics check', async () => {
    const kpis = { getById: vi.fn(async () => { throw new NotFoundException(); }) };
    const ac = { isKpiAnalyticsAllowed: vi.fn(async () => true) };
    await expect(requireAnalyticsKpi(kpis as never, ac, 'k1')).rejects.toBeInstanceOf(NotFoundException);
    expect(ac.isKpiAnalyticsAllowed).not.toHaveBeenCalled();
  });
});
