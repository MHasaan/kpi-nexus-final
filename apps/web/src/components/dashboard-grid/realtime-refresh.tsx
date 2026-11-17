'use client';

import { useEffect, useRef } from 'react';

import { subscribeRealtime } from '../../lib/api-client';

interface RealtimeRefreshProps {
  dashboardId: string;
  /**
   * Changes when the dashboard's widgets change. The server reads which KPIs
   * the dashboard shows when the stream opens, so a board that gains a widget
   * has to reconnect to hear about its KPI.
   */
  widgetsKey?: string;
  onRefresh: () => void;
  /** Whether the stream is open right now. */
  onStatus?: (connected: boolean) => void;
}

/** A burst of values (an import, a connector run) becomes one refresh. */
export const REFRESH_DEBOUNCE_MS = 800;

/** Whether an event from the stream means the numbers on screen are stale. */
export function isDataEvent(type: string): boolean {
  return type === 'data_point_added' || type === 'data_point_updated';
}

/**
 * Invisible: subscribes to the real-time stream for one dashboard and asks for
 * a refresh — of the data, in place, with no reload — when a value arrives for
 * a KPI the dashboard shows (UI-006).
 */
export function RealtimeRefresh({ dashboardId, widgetsKey, onRefresh, onStatus }: RealtimeRefreshProps) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeRealtime(
      { dashboardId },
      (evt) => {
        if (!isDataEvent(evt.type)) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onRefreshRef.current(), REFRESH_DEBOUNCE_MS);
      },
      (connected) => onStatusRef.current?.(connected),
    );

    return () => {
      unsubscribe();
      onStatusRef.current?.(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dashboardId, widgetsKey]);

  return null;
}
