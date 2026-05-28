/**
 * RealtimeService unit tests — focused on the eventMatchesFilter predicate.
 *
 * We test the pure filtering function directly without Redis so the tests
 * are fast and hermetic. The service itself (Redis pub/sub wiring) requires
 * a live connection and is exercised in integration tests.
 */
import { describe, expect, test } from 'vitest';

import type { RealtimeEvent, RealtimeStreamQuery } from '@kpi-nexus/contracts';

import { eventMatchesFilter } from './realtime.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDataPointEvent(
  overrides: Partial<Extract<RealtimeEvent, { type: 'data_point_added' }>> = {},
): Extract<RealtimeEvent, { type: 'data_point_added' }> {
  return {
    type: 'data_point_added',
    kpiId: 'kpi-1',
    dataPointId: 'dp-1',
    value: 42,
    recordedAt: new Date().toISOString(),
    orgUnitId: null,
    userId: null,
    ...overrides,
  };
}

function makePingEvent(): Extract<RealtimeEvent, { type: 'ping' }> {
  return { type: 'ping', timestamp: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// No-filter cases
// ---------------------------------------------------------------------------

describe('eventMatchesFilter — no filters', () => {
  test('data_point_added passes when no filters are set', () => {
    const event = makeDataPointEvent();
    const filters: RealtimeStreamQuery = {};
    expect(eventMatchesFilter(event, filters)).toBe(true);
  });

  test('ping passes when no filters are set', () => {
    expect(eventMatchesFilter(makePingEvent(), {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// kpiId filter
// ---------------------------------------------------------------------------

describe('eventMatchesFilter — kpiId filter', () => {
  test('event passes when kpiId matches', () => {
    const event = makeDataPointEvent({ kpiId: 'kpi-abc' });
    const filters: RealtimeStreamQuery = { kpiId: 'kpi-abc' };
    expect(eventMatchesFilter(event, filters)).toBe(true);
  });

  test('event is rejected when kpiId does not match', () => {
    const event = makeDataPointEvent({ kpiId: 'kpi-abc' });
    const filters: RealtimeStreamQuery = { kpiId: 'kpi-xyz' };
    expect(eventMatchesFilter(event, filters)).toBe(false);
  });

  test('ping always passes even when kpiId filter is active', () => {
    // ping has no kpiId field; clients need heartbeats regardless of filter
    const filters: RealtimeStreamQuery = { kpiId: 'kpi-abc' };
    expect(eventMatchesFilter(makePingEvent(), filters)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dashboardId filter
// ---------------------------------------------------------------------------

describe('eventMatchesFilter — dashboardId filter', () => {
  test('event passes when dashboardId matches', () => {
    const event = makeDataPointEvent({ dashboardId: 'dash-1' });
    const filters: RealtimeStreamQuery = { dashboardId: 'dash-1' };
    expect(eventMatchesFilter(event, filters)).toBe(true);
  });

  test('event is rejected when dashboardId does not match', () => {
    const event = makeDataPointEvent({ dashboardId: 'dash-1' });
    const filters: RealtimeStreamQuery = { dashboardId: 'dash-99' };
    expect(eventMatchesFilter(event, filters)).toBe(false);
  });

  test('event without dashboardId is rejected when dashboardId filter is active', () => {
    // event.dashboardId is undefined (no dashboard context) but filter requires one
    const event = makeDataPointEvent(); // no dashboardId
    const filters: RealtimeStreamQuery = { dashboardId: 'dash-1' };
    expect(eventMatchesFilter(event, filters)).toBe(false);
  });

  test('ping always passes even when dashboardId filter is active', () => {
    const filters: RealtimeStreamQuery = { dashboardId: 'dash-1' };
    expect(eventMatchesFilter(makePingEvent(), filters)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Combined kpiId + dashboardId filters (AND logic)
// ---------------------------------------------------------------------------

describe('eventMatchesFilter — combined kpiId + dashboardId filters', () => {
  test('passes when both kpiId and dashboardId match', () => {
    const event = makeDataPointEvent({ kpiId: 'kpi-1', dashboardId: 'dash-1' });
    const filters: RealtimeStreamQuery = { kpiId: 'kpi-1', dashboardId: 'dash-1' };
    expect(eventMatchesFilter(event, filters)).toBe(true);
  });

  test('rejected when kpiId matches but dashboardId does not', () => {
    const event = makeDataPointEvent({ kpiId: 'kpi-1', dashboardId: 'dash-wrong' });
    const filters: RealtimeStreamQuery = { kpiId: 'kpi-1', dashboardId: 'dash-1' };
    expect(eventMatchesFilter(event, filters)).toBe(false);
  });

  test('rejected when dashboardId matches but kpiId does not', () => {
    const event = makeDataPointEvent({ kpiId: 'kpi-wrong', dashboardId: 'dash-1' });
    const filters: RealtimeStreamQuery = { kpiId: 'kpi-1', dashboardId: 'dash-1' };
    expect(eventMatchesFilter(event, filters)).toBe(false);
  });

  test('ping always passes even when both filters are active', () => {
    const filters: RealtimeStreamQuery = { kpiId: 'kpi-1', dashboardId: 'dash-1' };
    expect(eventMatchesFilter(makePingEvent(), filters)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('eventMatchesFilter — edge cases', () => {
  test('event with dashboardId undefined passes a kpiId-only filter when kpiId matches', () => {
    const event = makeDataPointEvent({ kpiId: 'kpi-1' }); // dashboardId: undefined
    const filters: RealtimeStreamQuery = { kpiId: 'kpi-1' };
    expect(eventMatchesFilter(event, filters)).toBe(true);
  });

  test('event with null orgUnitId and userId passes no-filter', () => {
    const event = makeDataPointEvent({ orgUnitId: null, userId: null });
    expect(eventMatchesFilter(event, {})).toBe(true);
  });
});
