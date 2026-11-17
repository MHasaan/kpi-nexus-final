import { describe, expect, test } from 'vitest';

import { dashboardKpiScope } from './dashboard-kpi-scope.js';

const widget = (widgetType: string, config: unknown = {}) => ({ widgetType, config });

describe('dashboardKpiScope', () => {
  test('the KPIs its widgets show', () => {
    const scope = dashboardKpiScope([widget('kpi_card', { kpiId: 'a' }), widget('line', { kpiId: 'b' }), widget('gauge', { kpiId: 'a' })]);
    expect(scope).toEqual(new Set(['a', 'b']));
  });

  test('a list or strategy-map widget shows every KPI, so everything matters', () => {
    expect(dashboardKpiScope([widget('kpi_card', { kpiId: 'a' }), widget('list')])).toBe('all');
    expect(dashboardKpiScope([widget('strategy_map')])).toBe('all');
  });

  test('a widget with no KPI (activity, or one not configured yet) adds nothing', () => {
    expect(dashboardKpiScope([widget('activity'), widget('kpi_card', {}), widget('line', { kpiId: 42 }), widget('bar', null)])).toEqual(new Set());
  });

  test('an empty dashboard listens for nothing', () => {
    expect(dashboardKpiScope([])).toEqual(new Set());
  });
});
