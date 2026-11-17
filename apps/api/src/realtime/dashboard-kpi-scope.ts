/**
 * Which KPIs a dashboard shows, from its widgets — what a live subscription to
 * that dashboard needs to hear about.
 *
 * A data event names the KPI it is for; it never names a dashboard (whoever
 * records a value has no idea which boards show it). So "events for this
 * dashboard" has to mean "events for the KPIs on it" (UI-006: filtering on a
 * dashboard id the event never carries delivered nothing, ever).
 */
export type DashboardKpiScope = 'all' | ReadonlySet<string>;

/** Widgets that summarise every KPI the viewer can see, rather than one KPI. */
const WHOLE_CATALOGUE_WIDGETS: ReadonlySet<string> = new Set(['list', 'strategy_map']);

export function dashboardKpiScope(widgets: ReadonlyArray<{ widgetType: string; config: unknown }>): DashboardKpiScope {
  const ids = new Set<string>();
  for (const widget of widgets) {
    if (WHOLE_CATALOGUE_WIDGETS.has(widget.widgetType)) return 'all';
    const kpiId = (widget.config as { kpiId?: unknown } | null)?.kpiId;
    if (typeof kpiId === 'string' && kpiId) ids.add(kpiId);
  }
  return ids;
}
