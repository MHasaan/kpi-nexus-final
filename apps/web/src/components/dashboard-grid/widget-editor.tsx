'use client';

import { useMemo, useState } from 'react';

import { cn } from '@/lib/cn';

import type { DashboardWidget, WidgetType } from '../../lib/api-client';
import { Badge, Button, Input, Label } from '../ui';
import { WidgetRenderer } from '../widgets/widget-renderer';

import { KpiPicker } from './kpi-picker';
import {
  buildWidgetConfig,
  WIDGET_META,
  WIDGET_TYPES_ORDER,
} from './widget-meta';

export interface WidgetEditorProps {
  mode: 'add' | 'edit';
  initial?: Pick<DashboardWidget, 'widgetType' | 'title' | 'config'>;
  busy?: boolean;
  error?: string | null;
  onSubmit: (body: {
    widgetType: WidgetType;
    title?: string;
    config: Record<string, unknown>;
  }) => void;
  onCancel: () => void;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asMaxItems(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 10;
}

/**
 * Reusable add/edit experience for a single dashboard widget:
 * a type picker (cards), a KPI picker (when the type needs one),
 * per-type config inputs, and a live preview rendered with the real
 * `<WidgetRenderer>` so the chosen chart/card updates as you go.
 */
export function WidgetEditor({
  mode,
  initial,
  busy = false,
  error = null,
  onSubmit,
  onCancel,
}: WidgetEditorProps) {
  const [type, setType] = useState<WidgetType>(initial?.widgetType ?? 'kpi_card');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kpiId, setKpiId] = useState<string | undefined>(
    asString(initial?.config?.['kpiId']) || undefined,
  );
  const [unit, setUnit] = useState(asString(initial?.config?.['unit']));
  const [maxItems, setMaxItems] = useState<number>(
    asMaxItems(initial?.config?.['maxItems']),
  );

  const meta = WIDGET_META[type];
  const requiresKpi = meta.requiresKpi;
  const hasKpi = !requiresKpi || Boolean(kpiId);
  const canSubmit = hasKpi && !busy;

  // Synthetic widget for the live preview — recomputed from current state.
  const previewWidget: DashboardWidget = useMemo(() => {
    const config = buildWidgetConfig(type, {
      kpiId,
      unit,
      maxItems,
    });
    return {
      id: 'preview',
      widgetType: type,
      title: title.trim() || null,
      config,
      position: { x: 0, y: 0, w: meta.defaultSize.w, h: meta.defaultSize.h },
      sortOrder: 0,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
  }, [type, title, kpiId, unit, maxItems, meta.defaultSize.w, meta.defaultSize.h]);

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      widgetType: type,
      title: title.trim() || undefined,
      config: buildWidgetConfig(type, { kpiId, unit, maxItems }),
    });
  }

  return (
    <div
      data-testid="widget-editor"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      {/* ---- Config column ---- */}
      <div className="flex flex-col gap-5">
        {/* Type picker */}
        <div className="flex flex-col gap-2">
          <Label>Widget type</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {WIDGET_TYPES_ORDER.map((t) => {
              const m = WIDGET_META[t];
              const Icon = m.icon;
              const active = t === type;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  data-testid={`widget-type-${t}`}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-accent-primary bg-accent-bg'
                      : 'border-border bg-surface-bg hover:bg-surface-2',
                  )}
                >
                  <div className="flex w-full items-center gap-2">
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active ? 'text-accent-primary' : 'text-content-muted',
                      )}
                      aria-hidden
                    />
                    <span className="truncate text-sm font-medium text-content-strong">
                      {m.label}
                    </span>
                    {m.experimental && (
                      <Badge tone="info" className="ml-auto shrink-0">
                        Preview
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs leading-snug text-content-muted">
                    {m.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* KPI picker (only when the type needs one) */}
        {requiresKpi && (
          <div className="flex flex-col gap-1">
            <KpiPicker
              value={kpiId}
              onChange={setKpiId}
              required
              testId="kpi-picker"
            />
            {!kpiId && (
              <p className="text-xs text-content-muted">
                Pick a {meta.label.toLowerCase()} target before you can add it.
              </p>
            )}
          </div>
        )}

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="widget-title">
            Title{' '}
            <span className="font-normal text-content-muted">(optional)</span>
          </Label>
          <Input
            id="widget-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            maxLength={120}
            data-testid="widget-title"
          />
          <p className="text-xs text-content-muted">
            Defaults to the KPI name if left blank.
          </p>
        </div>

        {/* Per-type config */}
        {meta.supportsUnit && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-unit">
              Unit override{' '}
              <span className="font-normal text-content-muted">(optional)</span>
            </Label>
            <Input
              id="widget-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={busy}
              maxLength={16}
              data-testid="widget-unit"
            />
            <p className="text-xs text-content-muted">
              e.g. $, %, ms — defaults to the KPI&apos;s unit.
            </p>
          </div>
        )}

        {meta.supportsMaxItems && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-maxitems">Max items</Label>
            <Input
              id="widget-maxitems"
              type="number"
              min={1}
              max={50}
              value={maxItems}
              onChange={(e) => {
                const n = Number(e.target.value);
                setMaxItems(Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
              }}
              disabled={busy}
              data-testid="widget-maxitems"
              className="w-32"
            />
          </div>
        )}
      </div>

      {/* ---- Preview column ---- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Label>Live preview</Label>
          <span className="text-xs text-content-muted">{meta.label}</span>
        </div>
        <div
          data-testid="widget-preview"
          className="h-60 overflow-hidden rounded-lg border border-border bg-surface-1"
        >
          {requiresKpi && !kpiId ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
              <meta.icon className="h-6 w-6 text-content-muted" aria-hidden />
              <p className="text-sm text-content-muted">Pick a KPI to preview</p>
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="border-b border-border px-3 py-2">
                <span className="truncate text-xs font-semibold text-content-strong">
                  {previewWidget.title ?? meta.label}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <WidgetRenderer widget={previewWidget} />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p
            role="alert"
            data-testid="widget-editor-error"
            className="text-sm text-status-critical"
          >
            {error}
          </p>
        )}

        {/* Footer */}
        <div className="mt-1 flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            isLoading={busy}
            data-testid="widget-editor-submit"
          >
            {mode === 'add' ? 'Add widget' : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            data-testid="widget-editor-cancel"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
