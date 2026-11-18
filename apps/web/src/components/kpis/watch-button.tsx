'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui';
import { ApiError, type KpiWatchEvent, getKpiWatch, unwatchKpi, watchKpi } from '@/lib/api-client';

const EVENTS: Array<{ key: KpiWatchEvent; label: string }> = [
  { key: 'threshold_breached', label: 'An alert rule fires' },
  { key: 'anomaly_confirmed', label: 'An anomaly is confirmed' },
  { key: 'status_changed', label: 'Its status changes' },
  { key: 'data_point_added', label: 'A new value is recorded' },
];

/**
 * Watch a KPI: pick events; each one raises a personal notice in your alerts
 * (only for values you are allowed to see; never with the value itself).
 */
export function WatchButton({ kpiId }: { kpiId: string }) {
  const [watching, setWatching] = useState(false);
  const [events, setEvents] = useState<KpiWatchEvent[]>(['threshold_breached', 'anomaly_confirmed', 'status_changed']);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getKpiWatch(kpiId)
      .then((w) => {
        if (cancelled || !w.watching) return;
        setWatching(true);
        setEvents(w.events);
      })
      .catch((err: unknown) => {
        // Not knowing is not "not watching": say so, and leave the button usable.
        if (!cancelled) setLoadError(err instanceof ApiError && err.message ? `Your watch settings could not be loaded: ${err.message}` : 'Your watch settings could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [kpiId]);

  const toggle = (key: KpiWatchEvent) => setEvents((cur) => (cur.includes(key) ? cur.filter((e) => e !== key) : [...cur, key]));

  const save = async () => {
    setError(null);
    try {
      const w = await watchKpi(kpiId, events);
      setWatching(true);
      setEvents(w.events);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    }
  };

  const stop = async () => {
    setError(null);
    try {
      await unwatchKpi(kpiId);
      setWatching(false);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop watching');
    }
  };

  return (
    <span className="relative">
      <Button type="button" size="sm" variant={watching ? 'secondary' : 'ghost'} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="watch-button">
        {watching ? 'Watching ✓' : 'Watch'}
      </Button>
      {loadError && (
        <span role="alert" data-testid="watch-load-error" className="ml-2 text-xs text-status-critical">
          {loadError}
        </span>
      )}
      {open && (
        <div className="fixed inset-x-4 z-20 mt-2 rounded-lg border border-border bg-surface-1 p-3 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:w-64" data-testid="watch-panel">
          <p className="mb-2 text-xs text-content-muted">Tell me when:</p>
          <ul className="space-y-1">
            {EVENTS.map((e) => (
              <li key={e.key}>
                <label className="flex items-center gap-2 text-sm text-content-strong">
                  <input type="checkbox" checked={events.includes(e.key)} onChange={() => toggle(e.key)} data-testid={`watch-event-${e.key}`} />
                  {e.label}
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="mt-2 text-xs text-status-critical" role="alert">{error}</p>}
          <div className="mt-3 flex justify-between gap-2">
            {watching ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => void stop()} data-testid="watch-stop">
                Stop watching
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" disabled={events.length === 0} onClick={() => void save()} data-testid="watch-save">
              Save
            </Button>
          </div>
        </div>
      )}
    </span>
  );
}
