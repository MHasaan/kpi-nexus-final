'use client';

import { useEffect, useState } from 'react';

import {
  getDashboardSummary,
  listKpiDataPoints,
  listKpis,
  type DashboardSummaryRow,
  type DashboardWidget,
  type DataPoint,
  type KpiSummary,
} from '../../lib/api-client';

import { ActivityWidget } from './ActivityWidget';
import { BarChartWidget } from './BarChartWidget';
import { GaugeWidget } from './GaugeWidget';
import { KpiCard } from './KpiCard';
import { LineChartWidget } from './LineChartWidget';
import { ListWidget } from './ListWidget';
import { NumberWidget } from './NumberWidget';
import { PieChartWidget } from './PieChartWidget';
import { StrategyMapWidget } from './StrategyMapWidget';
import { TrendWidget } from './TrendWidget';

interface WidgetRendererProps {
  widget: DashboardWidget;
  dateRange?: { from?: string; to?: string };
}

export function WidgetRenderer({ widget, dateRange }: WidgetRendererProps) {
  const kpiId = widget.config['kpiId'] as string | undefined;

  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [summaryRows, setSummaryRows] = useState<DashboardSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsKpiData = [
    'kpi_card',
    'line',
    'bar',
    'pie',
    'gauge',
    'number',
    'trend',
  ].includes(widget.widgetType);

  const needsSummary = widget.widgetType === 'list';

  useEffect(() => {
    if (!needsKpiData && !needsSummary) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        if (needsSummary) {
          const rows = await getDashboardSummary(dateRange);
          if (!cancelled) setSummaryRows(rows);
        } else if (kpiId) {
          const [allKpis, points] = await Promise.all([
            listKpis(),
            listKpiDataPoints(kpiId, dateRange),
          ]);
          if (!cancelled) {
            setKpi(allKpis.find((k) => k.id === kpiId) ?? null);
            setDataPoints(points);
          }
        }
      } catch {
        if (!cancelled) setError('Failed to load widget data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [kpiId, needsKpiData, needsSummary, dateRange?.from, dateRange?.to]);

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid={`widget-render-${widget.id}`}
      >
        <p className="text-xs text-content-muted">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid={`widget-render-${widget.id}`}
        role="alert"
      >
        <p className="text-xs text-status-critical">{error}</p>
      </div>
    );
  }

  switch (widget.widgetType) {
    case 'kpi_card':
      return <KpiCard widget={widget} kpi={kpi} dataPoints={dataPoints} />;
    case 'line':
      return <LineChartWidget widget={widget} dataPoints={dataPoints} />;
    case 'bar':
      return <BarChartWidget widget={widget} dataPoints={dataPoints} />;
    case 'pie':
      return <PieChartWidget widget={widget} kpi={kpi} dataPoints={dataPoints} />;
    case 'gauge':
      return <GaugeWidget widget={widget} kpi={kpi} dataPoints={dataPoints} />;
    case 'number':
      return <NumberWidget widget={widget} kpi={kpi} dataPoints={dataPoints} />;
    case 'trend':
      return <TrendWidget widget={widget} dataPoints={dataPoints} />;
    case 'list':
      return <ListWidget widget={widget} summaryRows={summaryRows} />;
    case 'activity':
      return <ActivityWidget widget={widget} />;
    case 'strategy_map':
      return <StrategyMapWidget widget={widget} />;
    default: {
      // Exhaustive check — widgetType is narrowed by WidgetType union
      const _exhaustive: never = widget.widgetType;
      void _exhaustive;
      return (
        <div
          className="flex h-full items-center justify-center"
          data-testid={`widget-render-${widget.id}`}
        >
          <p className="text-xs text-content-muted">Unknown widget type</p>
        </div>
      );
    }
  }
}
