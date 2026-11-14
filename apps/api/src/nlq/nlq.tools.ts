import type { NormalizedTool, NormalizedToolCall } from '@kpi-nexus/ai';

import type { ForecastsService } from '../analytics/forecasts.service.js';
import type { KpiDataService } from '../kpis/kpi-data.service.js';
import type { PublicKpi } from '../kpis/kpis.service.js';

const MAX_HISTORY = 50;
const MAX_SERIES = 500;
const MAX_COMPARE = 5;
const MAX_HORIZON = 12;

const kpiIdParam = { kpiId: { type: 'string', description: 'The KPI id shown in the catalog (or its exact name).' } };

/** The tools the NLQ model may call. */
export const NLQ_TOOLS: NormalizedTool[] = [
  {
    name: 'get_metadata',
    description: "A KPI's definition: description, unit, scope, direction, target and thresholds.",
    parameters: { type: 'object', properties: kpiIdParam, required: ['kpiId'] },
  },
  {
    name: 'get_kpi_history',
    description: "A KPI's most recent recorded values, newest first. Use it to check exact values and dates.",
    parameters: {
      type: 'object',
      properties: { ...kpiIdParam, limit: { type: 'integer', description: `How many points (max ${MAX_HISTORY}).` } },
      required: ['kpiId'],
    },
  },
  {
    name: 'query_timeseries',
    description: "A KPI's values between two dates, optionally averaged per day, week or month.",
    parameters: {
      type: 'object',
      properties: {
        ...kpiIdParam,
        from: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
        to: { type: 'string', description: 'End date, YYYY-MM-DD.' },
        agg: { type: 'string', enum: ['none', 'day', 'week', 'month'], description: 'Average values per period.' },
      },
      required: ['kpiId'],
    },
  },
  {
    name: 'compare_kpis',
    description: `First value, latest value and change % for up to ${MAX_COMPARE} KPIs over an optional date range.`,
    parameters: {
      type: 'object',
      properties: {
        kpiIds: { type: 'array', items: { type: 'string' }, description: `Up to ${MAX_COMPARE} KPI ids.` },
        from: { type: 'string', description: 'Start date, YYYY-MM-DD.' },
        to: { type: 'string', description: 'End date, YYYY-MM-DD.' },
      },
      required: ['kpiIds'],
    },
  },
  {
    name: 'forecast_kpi',
    description: `Forecast a KPI's next periods (up to ${MAX_HORIZON}) from its history, with an 80% range.`,
    parameters: {
      type: 'object',
      properties: { ...kpiIdParam, horizon: { type: 'integer', description: `How many periods ahead (max ${MAX_HORIZON}).` } },
      required: ['kpiId'],
    },
  },
];

export interface ToolRun {
  /** JSON-serialisable result handed back to the model. */
  result: unknown;
  /** Visible KPIs the call read (for the answer's sources). */
  kpiIds: string[];
}

interface ScopedPoint {
  periodStart: Date;
  value: number;
  userId: string | null;
  orgUnitId: string | null;
}

class ToolError extends Error {}

const day = (d: Date) => d.toISOString().slice(0, 10);

function parseDate(raw: unknown): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const d = new Date(String(raw));
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(d.getTime())) {
    throw new ToolError(`Invalid date: ${String(raw)} (use YYYY-MM-DD)`);
  }
  return d;
}

function bucket(d: Date, agg: string): string {
  if (agg === 'month') return d.toISOString().slice(0, 7);
  if (agg === 'week') {
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return day(monday);
  }
  return day(d);
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Runs NLQ tool calls for one question. `visible` is the asker's visible KPI
 * catalog (KpisService.list): any other id is "not found" without a read.
 * Every data read is KpiDataService.listForKpi, which also applies the
 * point-level scope and Layer-4 clamps.
 */
export class NlqToolbox {
  constructor(
    private readonly kpiData: Pick<KpiDataService, 'listForKpi'>,
    private readonly visible: Map<string, PublicKpi>,
    private readonly forecasts: Pick<ForecastsService, 'forecast'>,
  ) {}

  async run(call: NormalizedToolCall): Promise<ToolRun> {
    const input = (call.input ?? {}) as Record<string, unknown>;
    try {
      switch (call.name) {
        case 'get_metadata':
          return this.metadata(input);
        case 'get_kpi_history':
          return await this.history(input);
        case 'query_timeseries':
          return await this.timeseries(input);
        case 'compare_kpis':
          return await this.compare(input);
        case 'forecast_kpi':
          return await this.forecast(input);
        default:
          return { result: { error: `Unknown tool: ${call.name}` }, kpiIds: [] };
      }
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, kpiIds: [] };
    }
  }

  /** By id, else by exact name (any case) — only ever within the visible catalog. */
  private find(raw: unknown): PublicKpi | undefined {
    if (typeof raw !== 'string') return undefined;
    const byId = this.visible.get(raw);
    if (byId) return byId;
    const name = raw.trim().toLowerCase();
    return [...this.visible.values()].find((k) => k.name.toLowerCase() === name);
  }

  private kpi(raw: unknown): PublicKpi {
    const kpi = this.find(raw);
    if (!kpi) throw new ToolError(`KPI not found: ${String(raw)}`);
    return kpi;
  }

  private points(rows: ScopedPoint[]) {
    const several = new Set(rows.map((p) => p.userId ?? p.orgUnitId ?? '')).size > 1;
    return rows.map((p) => ({
      period: day(p.periodStart),
      value: p.value,
      ...(several ? { series: p.userId ?? p.orgUnitId ?? 'org' } : {}),
    }));
  }

  private metadata(input: Record<string, unknown>): ToolRun {
    const k = this.kpi(input.kpiId);
    return {
      result: {
        id: k.id,
        name: k.name,
        description: k.description,
        unit: k.unit,
        scope: k.scope,
        direction: k.direction,
        frequency: k.frequency,
        targetValue: k.targetValue,
        warningThreshold: k.warningThreshold,
        criticalThreshold: k.criticalThreshold,
      },
      kpiIds: [k.id],
    };
  }

  private async history(input: Record<string, unknown>): Promise<ToolRun> {
    const k = this.kpi(input.kpiId);
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), MAX_HISTORY);
    const rows = (await this.kpiData.listForKpi(k.id, { limit })) as ScopedPoint[];
    return { result: { kpiId: k.id, name: k.name, unit: k.unit, points: this.points(rows) }, kpiIds: [k.id] };
  }

  private async timeseries(input: Record<string, unknown>): Promise<ToolRun> {
    const k = this.kpi(input.kpiId);
    const from = parseDate(input.from);
    const to = parseDate(input.to);
    const agg = typeof input.agg === 'string' ? input.agg : 'none';
    const rows = ((await this.kpiData.listForKpi(k.id, { from, to, limit: MAX_SERIES })) as ScopedPoint[]).slice().reverse();
    if (agg === 'none' || !['day', 'week', 'month'].includes(agg)) {
      return { result: { kpiId: k.id, name: k.name, unit: k.unit, points: this.points(rows) }, kpiIds: [k.id] };
    }
    const buckets = new Map<string, number[]>();
    for (const p of rows) {
      const key = bucket(p.periodStart, agg);
      buckets.set(key, [...(buckets.get(key) ?? []), p.value]);
    }
    const points = [...buckets.entries()].map(([period, values]) => ({
      period,
      value: round(values.reduce((a, b) => a + b, 0) / values.length),
      count: values.length,
    }));
    return { result: { kpiId: k.id, name: k.name, unit: k.unit, agg, points }, kpiIds: [k.id] };
  }

  private async compare(input: Record<string, unknown>): Promise<ToolRun> {
    const ids = (Array.isArray(input.kpiIds) ? input.kpiIds : []).slice(0, MAX_COMPARE);
    const from = parseDate(input.from);
    const to = parseDate(input.to);
    const read: string[] = [];
    const kpis = [];
    for (const raw of ids) {
      const k = this.find(raw);
      if (!k) {
        kpis.push({ kpiId: String(raw), error: `KPI not found: ${String(raw)}` });
        continue;
      }
      try {
        const rows = (await this.kpiData.listForKpi(k.id, { from, to, limit: MAX_SERIES })) as ScopedPoint[];
        const latest = rows[0]?.value ?? null;
        const first = rows[rows.length - 1]?.value ?? null;
        const changePct = first !== null && latest !== null && first !== 0 ? round(((latest - first) / Math.abs(first)) * 100) : null;
        kpis.push({ kpiId: k.id, name: k.name, unit: k.unit, direction: k.direction, first, latest, changePct, points: rows.length });
        read.push(k.id);
      } catch (err) {
        kpis.push({ kpiId: k.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { result: { kpis }, kpiIds: read };
  }

  /** ForecastsService applies KPI visibility, the ANALYTICS ceiling and the caller's point scope (BE-034); nothing is saved. */
  private async forecast(input: Record<string, unknown>): Promise<ToolRun> {
    const k = this.kpi(input.kpiId);
    const horizon = Math.min(Math.max(Number(input.horizon) || 3, 1), MAX_HORIZON);
    const f = await this.forecasts.forecast(k.id, { horizon, persist: false });
    const predictions = (f.predictions as unknown as Array<Record<string, unknown>>).map((p) => ({
      period: String(p.ds ?? ''),
      value: typeof p.yhat === 'number' ? round(p.yhat) : null,
      ...(typeof p.yhat_lower_80 === 'number' ? { low: round(p.yhat_lower_80) } : {}),
      ...(typeof p.yhat_upper_80 === 'number' ? { high: round(p.yhat_upper_80) } : {}),
    }));
    return { result: { kpiId: k.id, name: k.name, unit: k.unit, model: f.model, predictions }, kpiIds: [k.id] };
  }
}
