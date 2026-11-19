'use client';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { Maximize2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactGridLayout, { type Layout } from 'react-grid-layout';

import { ApiError, deleteWidget, updateWidgetPosition, type DashboardWidget } from '../../lib/api-client';
import { WIDGET_TYPE_LABELS, labelFor } from '../../lib/labels';
import { useConfirm } from '../../lib/use-confirm';
import { useToast } from '../../lib/use-toast';
import { WidgetRenderer } from '../widgets/widget-renderer';

interface DashboardGridProps {
  dashboardId: string;
  widgets: DashboardWidget[];
  editMode: boolean;
  dateRange?: { from?: string; to?: string };
  onWidgetDeleted: (widgetId: string) => void;
  onEditWidget?: (widget: DashboardWidget) => void;
  onLayoutSaved?: () => void;
}

/** The smallest a widget may be, in grid cells: smaller, nothing in it can be read. */
const MIN_W = 2;
const MIN_H = 2;

/**
 * The saved positions as a grid layout. A widget saved smaller than the
 * minimum (an old fault saved new widgets at one cell by one) is shown at the
 * minimum, never smaller.
 */
function widgetsToLayout(widgets: DashboardWidget[]): Layout {
  return widgets.map((w) => ({
    i: w.id,
    x: w.position.x,
    y: w.position.y,
    w: Math.max(w.position.w, MIN_W),
    h: Math.max(w.position.h, MIN_H),
    minW: MIN_W,
    minH: MIN_H,
  }));
}

/** Whether a layout has a place for exactly these widgets. */
function coversWidgets(layout: Layout, widgets: DashboardWidget[]): boolean {
  return layout.length === widgets.length && widgets.every((w) => layout.some((item) => item.i === w.id));
}

export function DashboardGrid({
  dashboardId,
  widgets,
  editMode,
  dateRange,
  onWidgetDeleted,
  onEditWidget,
  onLayoutSaved,
}: DashboardGridProps) {
  const confirm = useConfirm();
  const toast = useToast();
  const [layout, setLayout] = useState<Layout>(() => widgetsToLayout(widgets));
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep layout in sync when widgets prop changes (e.g. after add/delete)
  useEffect(() => {
    setLayout(widgetsToLayout(widgets));
  }, [widgets]);

  // Measure container width for react-grid-layout
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.offsetWidth);
    return () => observer.disconnect();
  }, []);

  // The layout handed to the grid always has a place for every widget. The state above follows the
  // widgets one render late (an effect), and in that render the grid library was handed a new widget
  // with no place: it invented one cell by one for it, which was then saved as the widget's size —
  // and a chart squeezed into one cell could bring the whole page down.
  const gridLayout = coversWidgets(layout, widgets) ? layout : widgetsToLayout(widgets);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      // A layout for other widgets than the ones on the board is stale: take nothing from it.
      if (!coversWidgets(newLayout, widgets)) return;
      setLayout(newLayout);
      // Only what a person arranges is saved. Outside edit mode a change comes from the grid settling
      // itself, not from anyone moving a widget, and has nothing to do with what is stored.
      if (!editMode) return;

      // Debounce position saves
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        // Save all changed positions in parallel
        const saves = newLayout
          .filter((item) => {
            const orig = widgets.find((w) => w.id === item.i);
            if (!orig) return false;
            // Never store a size nothing can be read at.
            if (item.w < MIN_W || item.h < MIN_H) return false;
            return (
              orig.position.x !== item.x ||
              orig.position.y !== item.y ||
              orig.position.w !== item.w ||
              orig.position.h !== item.h
            );
          })
          .map((item) =>
            updateWidgetPosition(dashboardId, item.i, {
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
            }).then(
              () => true,
              () => false,
            ),
          );

        if (saves.length > 0) {
          const saved = await Promise.all(saves);
          // A move that was not saved looks saved until the page is reloaded: say so (X-02).
          if (saved.includes(false)) toast.error('The new layout was not saved', 'Move the widget again, or reload to see the saved layout.');
          onLayoutSaved?.();
        }
      }, 350);
    },
    [dashboardId, widgets, onLayoutSaved, editMode],
  );

  async function handleDelete(widgetId: string) {
    const widget = widgets.find((x) => x.id === widgetId);
    const ok = await confirm({
      title: `Remove “${widget?.title ?? labelFor(WIDGET_TYPE_LABELS, widget?.widgetType ?? 'widget')}” from this dashboard?`,
      description: 'The KPI and its values are not affected.',
      confirmLabel: 'Remove widget',
      tone: 'danger',
      testId: 'widget-delete-confirm',
    });
    if (!ok) return;
    setDeletingId(widgetId);
    try {
      await deleteWidget(dashboardId, widgetId);
      onWidgetDeleted(widgetId);
    } catch (err) {
      toast.error('The widget was not removed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setDeletingId(null);
    }
  }

  if (widgets.length === 0) {
    // Outside edit mode the page says the dashboard is empty, in words that fit the reader
    // (someone who can add widgets, or someone who cannot). Saying it here too said it twice.
    if (!editMode) return null;
    return (
      <div
        data-testid="dashboard-widgets-empty"
        className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center"
      >
        <p className="text-sm text-content-muted">
          No widgets yet. Add one above.
        </p>
      </div>
    );
  }

  const ROW_HEIGHT = 80;
  const COLS = 12;
  const MARGIN: [number, number] = [12, 12];

  return (
    <div
      ref={containerRef}
      data-testid="dashboard-widgets-grid"
      className="w-full"
    >
      <ReactGridLayout
        layout={gridLayout}
        width={containerWidth}
        gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN }}
        dragConfig={{ enabled: editMode, handle: '.widget-drag-handle', cancel: '.widget-no-drag' }}
        resizeConfig={{ enabled: editMode }}
        onLayoutChange={handleLayoutChange}
      >
        {widgets.map((widget) => (
          <div
            key={widget.id}
            data-testid={`widget-card-${widget.id}`}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
          >
            {/* Widget header / drag handle */}
            <div
              className={`widget-drag-handle flex items-center justify-between border-b border-border px-3 py-2 ${
                editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
              }`}
            >
              {/* A widget on a KPI opens its detail view. Not while arranging: the header is the drag handle then. */}
              {!editMode && typeof widget.config['kpiId'] === 'string' ? (
                <Link
                  href={`/dashboards/${dashboardId}/widgets/${widget.id}`}
                  data-testid={`widget-open-${widget.id}`}
                  title="Open the detail view"
                  className="group flex min-w-0 items-center gap-1 text-xs font-semibold text-content-strong hover:text-accent-primary"
                >
                  <span className="truncate">{widget.title ?? labelFor(WIDGET_TYPE_LABELS, widget.widgetType)}</span>
                  <Maximize2 className="h-3 w-3 shrink-0 text-content-muted group-hover:text-accent-primary" aria-hidden />
                </Link>
              ) : (
                <span className="truncate text-xs font-semibold text-content-strong">
                  {widget.title ?? labelFor(WIDGET_TYPE_LABELS, widget.widgetType)}
                </span>
              )}
              {editMode && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-content-muted select-none">⠿</span>
                  {onEditWidget && (
                    <button
                      type="button"
                      onClick={() => onEditWidget(widget)}
                      data-testid={`widget-edit-${widget.id}`}
                      aria-label={`Edit ${widget.title ?? widget.widgetType} widget`}
                      className="widget-no-drag ml-1 rounded px-1.5 py-0.5 text-content-muted hover:bg-surface-2 hover:text-content-strong"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(widget.id)}
                    disabled={deletingId === widget.id}
                    data-testid={`widget-delete-${widget.id}`}
                    aria-label={`Delete ${widget.title ?? widget.widgetType} widget`}
                    className="widget-no-drag ml-1 rounded px-1.5 py-0.5 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
                  >
                    {deletingId === widget.id ? '…' : '✕'}
                  </button>
                </div>
              )}
            </div>
            {/* Widget body */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <WidgetRenderer widget={widget} dateRange={dateRange} />
            </div>
          </div>
        ))}
      </ReactGridLayout>
    </div>
  );
}
