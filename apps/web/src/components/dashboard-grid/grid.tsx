'use client';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { useCallback, useEffect, useRef, useState } from 'react';
import GridLayout, { type Layout } from 'react-grid-layout';

import { deleteWidget, updateWidgetPosition, type DashboardWidget } from '../../lib/api-client';
import { WidgetRenderer } from '../widgets/widget-renderer';

interface DashboardGridProps {
  dashboardId: string;
  widgets: DashboardWidget[];
  editMode: boolean;
  dateRange?: { from?: string; to?: string };
  onWidgetDeleted: (widgetId: string) => void;
  onLayoutSaved?: () => void;
}

function widgetsToLayout(widgets: DashboardWidget[]): Layout[] {
  return widgets.map((w) => ({
    i: w.id,
    x: w.position.x,
    y: w.position.y,
    w: w.position.w,
    h: w.position.h,
    minW: 2,
    minH: 2,
  }));
}

export function DashboardGrid({
  dashboardId,
  widgets,
  editMode,
  dateRange,
  onWidgetDeleted,
  onLayoutSaved,
}: DashboardGridProps) {
  const [layout, setLayout] = useState<Layout[]>(() => widgetsToLayout(widgets));
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

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      setLayout(newLayout);

      // Debounce position saves
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        // Save all changed positions in parallel
        const saves = newLayout
          .filter((item) => {
            const orig = widgets.find((w) => w.id === item.i);
            if (!orig) return false;
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
            }).catch(() => {
              // Best-effort — position saves are not critical
            }),
          );

        if (saves.length > 0) {
          await Promise.all(saves);
          onLayoutSaved?.();
        }
      }, 350);
    },
    [dashboardId, widgets, onLayoutSaved],
  );

  async function handleDelete(widgetId: string) {
    setDeletingId(widgetId);
    try {
      await deleteWidget(dashboardId, widgetId);
      onWidgetDeleted(widgetId);
    } catch {
      // Best-effort; parent will re-fetch on next refresh
    } finally {
      setDeletingId(null);
    }
  }

  if (widgets.length === 0) {
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
      <GridLayout
        layout={layout}
        cols={COLS}
        rowHeight={ROW_HEIGHT}
        width={containerWidth}
        margin={MARGIN}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={handleLayoutChange}
        useCSSTransforms
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
              <span className="truncate text-xs font-semibold text-content-strong">
                {widget.title ?? widget.widgetType}
              </span>
              {editMode && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-content-muted select-none">⠿</span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(widget.id)}
                    disabled={deletingId === widget.id}
                    data-testid={`widget-delete-${widget.id}`}
                    aria-label={`Delete ${widget.title ?? widget.widgetType} widget`}
                    className="ml-1 rounded px-1.5 py-0.5 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
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
      </GridLayout>
    </div>
  );
}
