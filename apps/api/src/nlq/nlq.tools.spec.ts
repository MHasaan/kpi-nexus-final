/**
 * NLQ tools the model can call in the tool-use loop. Every data read goes
 * through KpiDataService.listForKpi (KPI visibility + point scope + Layer-4
 * clamps), and a KPI outside the asker's visible catalog is answered "not
 * found" without any read, so a tool call can never widen what the asker sees.
 */
import { describe, expect, it, vi } from 'vitest';

import type { KpiDataService } from '../kpis/kpi-data.service.js';
import type { PublicKpi } from '../kpis/kpis.service.js';
import { NLQ_TOOLS, NlqToolbox } from './nlq.tools.js';

const kpi = (id: string, extra: Partial<PublicKpi> = {}) =>
  ({ id, name: `KPI ${id}`, description: null, unit: 'USD', scope: 'ORG_WIDE', direction: 'HIGHER_IS_BETTER', targetValue: 100, warningThreshold: 80, criticalThreshold: 50, frequency: 'MONTHLY', ...extra }) as unknown as PublicKpi;

const point = (period: string, value: number, extra: Record<string, unknown> = {}) => ({ periodStart: new Date(period), value, userId: null, orgUnitId: null, ...extra });

function makeToolbox(series: Record<string, ReturnType<typeof point>[]> = {}) {
  // listForKpi returns newest first, like the real reader.
  const listForKpi = vi.fn(async (kpiId: string) => [...(series[kpiId] ?? [])].sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime()));
  const visible = new Map([kpi('rev'), kpi('churn', { direction: 'LOWER_IS_BETTER', unit: '%' }), kpi('calls', { scope: 'PER_USER' })].map((k) => [k.id, k]));
  const toolbox = new NlqToolbox({ listForKpi } as unknown as KpiDataService, visible);
  return { toolbox, listForKpi };
}

const call = (name: string, input: object) => ({ id: 'c1', name, input });

describe('NLQ_TOOLS', () => {
  it('declares the four tools with JSON-schema parameters', () => {
    expect(NLQ_TOOLS.map((t) => t.name)).toEqual(['get_metadata', 'get_kpi_history', 'query_timeseries', 'compare_kpis']);
    for (const t of NLQ_TOOLS) expect(t.parameters).toMatchObject({ type: 'object' });
  });
});

describe('NlqToolbox', () => {
  it('a KPI outside the visible catalog is "not found", with no data read', async () => {
    const { toolbox, listForKpi } = makeToolbox();
    for (const [name, input] of [
      ['get_metadata', { kpiId: 'secret' }],
      ['get_kpi_history', { kpiId: 'secret' }],
      ['query_timeseries', { kpiId: 'secret' }],
    ] as const) {
      const out = await toolbox.run(call(name, input));
      expect(out.result).toEqual({ error: 'KPI not found: secret' });
      expect(out.kpiIds).toEqual([]);
    }
    expect(listForKpi).not.toHaveBeenCalled();
  });

  it('accepts a visible KPI\'s exact name (any case) as well as its id; a hidden KPI\'s name stays not found', async () => {
    const { toolbox, listForKpi } = makeToolbox({ rev: [point('2026-01-01', 10)] });
    const out = await toolbox.run(call('get_kpi_history', { kpiId: 'kpi REV' }));
    expect(out.kpiIds).toEqual(['rev']);
    expect(listForKpi).toHaveBeenCalledWith('rev', { limit: 20 });
    expect((await toolbox.run(call('get_metadata', { kpiId: 'KPI secret' }))).result).toEqual({ error: 'KPI not found: KPI secret' });
    const cmp = await toolbox.run(call('compare_kpis', { kpiIds: ['KPI churn'] }));
    expect(cmp.kpiIds).toEqual(['churn']);
  });

  it('get_metadata returns the definition, not data', async () => {
    const { toolbox, listForKpi } = makeToolbox();
    const out = await toolbox.run(call('get_metadata', { kpiId: 'churn' }));
    expect(out.result).toMatchObject({ id: 'churn', name: 'KPI churn', unit: '%', direction: 'LOWER_IS_BETTER', targetValue: 100 });
    expect(out.kpiIds).toEqual(['churn']);
    expect(listForKpi).not.toHaveBeenCalled();
  });

  it('get_kpi_history reads through the scoped reader, newest first, limit capped at 50', async () => {
    const { toolbox, listForKpi } = makeToolbox({ rev: [point('2026-01-01', 10), point('2026-02-01', 12)] });
    const out = await toolbox.run(call('get_kpi_history', { kpiId: 'rev', limit: 500 }));
    expect(listForKpi).toHaveBeenCalledWith('rev', { limit: 50 });
    expect(out.result).toEqual({ kpiId: 'rev', name: 'KPI rev', unit: 'USD', points: [{ period: '2026-02-01', value: 12 }, { period: '2026-01-01', value: 10 }] });
  });

  it('points of several people (a manager\'s PER_USER read) carry a series key', async () => {
    const { toolbox } = makeToolbox({ calls: [point('2026-01-01', 5, { userId: 'u1' }), point('2026-01-01', 7, { userId: 'u2' })] });
    const out = (await toolbox.run(call('get_kpi_history', { kpiId: 'calls' }))).result as { points: Array<Record<string, unknown>> };
    expect(out.points.map((p) => p.series).sort()).toEqual(['u1', 'u2']);
  });

  it('query_timeseries passes the date range and can average by month', async () => {
    const { toolbox, listForKpi } = makeToolbox({ rev: [point('2026-01-05', 10), point('2026-01-20', 20), point('2026-02-03', 40)] });
    const out = await toolbox.run(call('query_timeseries', { kpiId: 'rev', from: '2026-01-01', to: '2026-03-01', agg: 'month' }));
    expect(listForKpi).toHaveBeenCalledWith('rev', { from: new Date('2026-01-01'), to: new Date('2026-03-01'), limit: 500 });
    expect((out.result as { points: unknown }).points).toEqual([
      { period: '2026-01', value: 15, count: 2 },
      { period: '2026-02', value: 40, count: 1 },
    ]);
  });

  it('query_timeseries rejects a date it cannot parse', async () => {
    const { toolbox, listForKpi } = makeToolbox();
    const out = await toolbox.run(call('query_timeseries', { kpiId: 'rev', from: 'last tuesday' }));
    expect(out.result).toEqual({ error: 'Invalid date: last tuesday (use YYYY-MM-DD)' });
    expect(listForKpi).not.toHaveBeenCalled();
  });

  it('compare_kpis summarises each visible KPI (first, latest, change %) and reports the rest as not found', async () => {
    const { toolbox } = makeToolbox({ rev: [point('2026-01-01', 100), point('2026-02-01', 150)], churn: [point('2026-01-01', 4), point('2026-02-01', 3)] });
    const out = await toolbox.run(call('compare_kpis', { kpiIds: ['rev', 'churn', 'secret'] }));
    expect(out.result).toEqual({
      kpis: [
        { kpiId: 'rev', name: 'KPI rev', unit: 'USD', direction: 'HIGHER_IS_BETTER', first: 100, latest: 150, changePct: 50, points: 2 },
        { kpiId: 'churn', name: 'KPI churn', unit: '%', direction: 'LOWER_IS_BETTER', first: 4, latest: 3, changePct: -25, points: 2 },
        { kpiId: 'secret', error: 'KPI not found: secret' },
      ],
    });
    expect(out.kpiIds).toEqual(['rev', 'churn']);
  });

  it('compare_kpis takes at most 5 KPIs', async () => {
    const { toolbox, listForKpi } = makeToolbox();
    await toolbox.run(call('compare_kpis', { kpiIds: ['rev', 'churn', 'calls', 'rev', 'churn', 'calls', 'rev'] }));
    expect(listForKpi).toHaveBeenCalledTimes(5);
  });

  it('a refused read and an unknown tool come back as errors, not exceptions', async () => {
    const { toolbox, listForKpi } = makeToolbox();
    listForKpi.mockRejectedValueOnce(new Error('KPI not found'));
    expect((await toolbox.run(call('get_kpi_history', { kpiId: 'rev' }))).result).toEqual({ error: 'KPI not found' });
    expect((await toolbox.run(call('drop_tables', {}))).result).toEqual({ error: 'Unknown tool: drop_tables' });
  });
});
