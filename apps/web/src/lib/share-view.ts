import type { DashboardWidget, PublicDashboardPayload, PublicWidget, WidgetType } from './api-client';

/** The public share page: turning what the API sends into what the dashboard's own widgets take. */

const WIDGET_TYPES: readonly WidgetType[] = ['kpi_card', 'line', 'bar', 'pie', 'gauge', 'number', 'list', 'trend', 'activity', 'strategy_map'];

/** The widget as the dashboard's components expect it, or null for a kind this page does not know. */
export function shareWidget(widget: PublicWidget): DashboardWidget | null {
  const widgetType = WIDGET_TYPES.find((t) => t === widget.widgetType);
  if (!widgetType) return null;
  return {
    id: widget.id,
    widgetType,
    title: widget.title,
    config: widget.config ?? {},
    position: widget.position,
    sortOrder: widget.sortOrder,
    createdAt: '',
    updatedAt: '',
  };
}

/** The KPI a widget points at, as sent — or null when it has none or it was withheld. */
export function shareKpi(widget: PublicWidget, payload: Pick<PublicDashboardPayload, 'kpis'>) {
  const kpiId = widget.config?.['kpiId'];
  return typeof kpiId === 'string' ? (payload.kpis?.[kpiId] ?? null) : null;
}

const COLS = 12;

/** The smallest a widget is shown, in grid cells each way — the dashboard's own minimum. */
const MIN_CELLS = 2;

/**
 * Where a widget sits on the 12-column grid, as CSS grid lines — the same
 * place its author put it. Null when the stored position is not usable, and
 * the widget then simply flows after the others.
 */
export function shareCell(position: unknown): { column: string; row: string } | null {
  const p = position as { x?: unknown; y?: unknown; w?: unknown; h?: unknown } | null;
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
  if (!p || !whole(p.x) || !whole(p.y) || !whole(p.w) || !whole(p.h)) return null;
  // Smaller than two cells by two is not a size anyone chose (an old fault saved new widgets at one
  // by one): such a widget is not pinned there, where it would be a sliver, but flows after the others.
  if (p.x < 0 || p.x >= COLS || p.y < 0 || p.w < MIN_CELLS || p.h < MIN_CELLS) return null;
  const width = Math.min(p.w, COLS - p.x);
  return { column: `${p.x + 1} / span ${width}`, row: `${p.y + 1} / span ${p.h}` };
}

/** Widgets in reading order: top to bottom, then left to right — the order they stack in on a phone. */
export function readingOrder<T extends { position: unknown; sortOrder: number }>(widgets: readonly T[]): T[] {
  const at = (w: T) => {
    const p = w.position as { x?: unknown; y?: unknown } | null;
    return { x: typeof p?.x === 'number' ? p.x : 0, y: typeof p?.y === 'number' ? p.y : Number.MAX_SAFE_INTEGER };
  };
  return [...widgets].sort((a, b) => at(a).y - at(b).y || at(a).x - at(b).x || a.sortOrder - b.sortOrder);
}
