import type { LucideIcon } from 'lucide-react';
import {
  Gauge,
  LineChart,
  BarChart3,
  PieChart,
  Hash,
  CreditCard,
  List,
  TrendingUp,
  Activity,
  LayoutGrid,
} from 'lucide-react';

import type { WidgetType } from '../../lib/api-client';

export interface WidgetMeta {
  type: WidgetType;
  label: string;
  description: string; // one line: what it renders
  icon: LucideIcon;
  requiresKpi: boolean; // shows + requires the KPI picker
  supportsUnit: boolean; // shows a unit-override input
  supportsMaxItems: boolean; // shows a max-items number input (list)
  experimental?: boolean; // activity / strategy_map — labelled "Preview"
  defaultSize: { w: number; h: number }; // sensible grid size
}

export const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  kpi_card: {
    type: 'kpi_card',
    label: 'KPI card',
    description: 'Headline value + sparkline for one KPI.',
    icon: CreditCard,
    requiresKpi: true,
    supportsUnit: true,
    supportsMaxItems: false,
    defaultSize: { w: 3, h: 2 },
  },
  number: {
    type: 'number',
    label: 'Number',
    description: 'Big single value for one KPI.',
    icon: Hash,
    requiresKpi: true,
    supportsUnit: true,
    supportsMaxItems: false,
    defaultSize: { w: 3, h: 2 },
  },
  line: {
    type: 'line',
    label: 'Line chart',
    description: 'KPI values over time.',
    icon: LineChart,
    requiresKpi: true,
    supportsUnit: false,
    supportsMaxItems: false,
    defaultSize: { w: 6, h: 4 },
  },
  bar: {
    type: 'bar',
    label: 'Bar chart',
    description: 'KPI values as bars over time.',
    icon: BarChart3,
    requiresKpi: true,
    supportsUnit: false,
    supportsMaxItems: false,
    defaultSize: { w: 6, h: 4 },
  },
  trend: {
    type: 'trend',
    label: 'Trend area',
    description: 'Filled area trend for one KPI.',
    icon: TrendingUp,
    requiresKpi: true,
    supportsUnit: false,
    supportsMaxItems: false,
    defaultSize: { w: 6, h: 4 },
  },
  pie: {
    type: 'pie',
    label: 'Pie chart',
    description: 'Actual vs target (or recent split) for one KPI.',
    icon: PieChart,
    requiresKpi: true,
    supportsUnit: false,
    supportsMaxItems: false,
    defaultSize: { w: 4, h: 4 },
  },
  gauge: {
    type: 'gauge',
    label: 'Gauge',
    description: 'Latest value against target + thresholds.',
    icon: Gauge,
    requiresKpi: true,
    supportsUnit: false,
    supportsMaxItems: false,
    defaultSize: { w: 4, h: 4 },
  },
  list: {
    type: 'list',
    label: 'KPI list',
    description: 'A compact list of KPIs with latest values.',
    icon: List,
    requiresKpi: false,
    supportsUnit: false,
    supportsMaxItems: true,
    defaultSize: { w: 4, h: 4 },
  },
  activity: {
    type: 'activity',
    label: 'Activity',
    description: 'Recent activity feed (preview).',
    icon: Activity,
    requiresKpi: false,
    supportsUnit: false,
    supportsMaxItems: false,
    experimental: true,
    defaultSize: { w: 4, h: 4 },
  },
  strategy_map: {
    type: 'strategy_map',
    label: 'Strategy map',
    description: 'Balanced-scorecard quadrants (preview).',
    icon: LayoutGrid,
    requiresKpi: false,
    supportsUnit: false,
    supportsMaxItems: false,
    experimental: true,
    defaultSize: { w: 6, h: 4 },
  },
};

export const WIDGET_TYPES_ORDER: WidgetType[] = [
  'kpi_card',
  'number',
  'line',
  'bar',
  'trend',
  'pie',
  'gauge',
  'list',
  'activity',
  'strategy_map',
];

/** Build the freeform config object the renderer expects for a given type. */
export function buildWidgetConfig(
  type: WidgetType,
  opts: { kpiId?: string; unit?: string; maxItems?: number },
): Record<string, unknown> {
  const m = WIDGET_META[type];
  const config: Record<string, unknown> = {};
  if (m.requiresKpi && opts.kpiId) config['kpiId'] = opts.kpiId;
  if (m.supportsUnit && opts.unit && opts.unit.trim()) config['unit'] = opts.unit.trim();
  if (m.supportsMaxItems && opts.maxItems != null) config['maxItems'] = opts.maxItems;
  return config;
}
