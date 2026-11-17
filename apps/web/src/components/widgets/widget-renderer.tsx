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

import { useDashboardData } from '../dashboard-grid/dashboard-data';

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
  // Inside a dashboard the KPI list and summary are loaded once for the board.
  const shared = useDashboardData();

  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [summaryRows, setSummaryRows] = useState<DashboardSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once something has been shown, a reload keeps it on screen until the new
  // values arrive — a live refresh must not blank every widget on the board.
  const [loaded, setLoaded] = useState(false);

  const needsKpiData = [
    'kpi_card',
    'line',
    'bar',
    'pie',
    'gauge',
    'number',
    'trend',
  ].includes(widget.widgetType);

  const needsSummary = widget.widgetType === 'list' || widget.widgetType === 'strategy_map';

  // Inside a dashboard the KPI definition and the summary rows come from the
  // board's one shared load; only a lone preview (the widget editor) fetches them.
  const inDashboard = shared !== null;
  const refreshKey = shared?.refreshKey ?? 0;

  useEffect(() => {
    if (!needsKpiData && !needsSummary) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        if (needsSummary) {
          if (!inDashboard) {
            const rows = await getDashboardSummary(dateRange);
            if (!cancelled) setSummaryRows(rows);
          }
          if (!cancelled) setLoaded(true);
        } else if (kpiId) {
          const [kpiDefinition, points] = await Promise.all([
            inDashboard ? Promise.resolve(null) : listKpis().then((all) => all.find((k) => k.id === kpiId) ?? null),
            listKpiDataPoints(kpiId, dateRange),
          ]);
          if (!cancelled) {
            if (!inDashboard) setKpi(kpiDefinition);
            setDataPoints(points);
            setLoaded(true);
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
    // `refreshKey` reloads this widget's own series when a value arrives live.
  }, [kpiId, needsKpiData, needsSummary, dateRange?.from, dateRange?.to, inDashboard, refreshKey]);

  const shownKpi = inDashboard && kpiId ? (shared.kpis.get(kpiId) ?? null) : kpi;
  const shownRows = inDashboard ? [...shared.rows.values()] : summaryRows;

  if (loading && !loaded) {
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
      return <KpiCard widget={widget} kpi={shownKpi} dataPoints={dataPoints} status={kpiId ? (shared?.rows.get(kpiId)?.status ?? null) : null} />;
    case 'line':
      return <LineChartWidget widget={widget} dataPoints={dataPoints} />;
    case 'bar':
      return <BarChartWidget widget={widget} dataPoints={dataPoints} />;
    case 'pie':
      return <PieChartWidget widget={widget} kpi={shownKpi} dataPoints={dataPoints} />;
    case 'gauge':
      return <GaugeWidget widget={widget} kpi={shownKpi} dataPoints={dataPoints} />;
    case 'number':
      return <NumberWidget widget={widget} kpi={shownKpi} dataPoints={dataPoints} />;
    case 'trend':
      return <TrendWidget widget={widget} dataPoints={dataPoints} />;
    case 'list':
      return <ListWidget widget={widget} summaryRows={shownRows} />;
    case 'activity':
      return <ActivityWidget widget={widget} />;
    case 'strategy_map':
      return <StrategyMapWidget widget={widget} summaryRows={shownRows} />;
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
