'use client';

import { useEffect, useRef } from 'react';

import { subscribeRealtime } from '../../lib/api-client';

interface RealtimeRefreshProps {
  dashboardId: string;
  onRefresh: () => void;
}

/**
 * Invisible component that subscribes to the real-time SSE stream and
 * triggers a data refresh (without page reload) when a data_point_added
 * event arrives.
 */
export function RealtimeRefresh({ dashboardId, onRefresh }: RealtimeRefreshProps) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeRealtime(
      { dashboardId },
      (evt) => {
        if (evt.type === 'data_point_added' || evt.type === 'message') {
          // Debounce 1500ms — multiple events can arrive in quick succession
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            onRefreshRef.current();
          }, 1500);
        }
      },
    );

    return () => {
      unsubscribe();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [dashboardId]);

  // Renders nothing visible
  return null;
}
