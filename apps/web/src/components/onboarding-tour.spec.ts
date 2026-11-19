import { describe, expect, test } from 'vitest';

import { shouldShowTour, tourSlides } from './onboarding-tour';

describe('shouldShowTour', () => {
  test('someone whose account has not finished the tour sees it', () => {
    expect(shouldShowTour(null, null)).toBe(true);
    expect(shouldShowTour(null, undefined)).toBe(true);
  });

  test('once the account has finished it, it is not shown again — on any browser', () => {
    expect(shouldShowTour(null, '2026-11-17T10:00:00.000Z')).toBe(false);
  });

  test('a browser that dismissed it before completion moved to the account is left alone', () => {
    expect(shouldShowTour('1', null)).toBe(false);
  });
});

describe('tourSlides', () => {
  const titles = (keys: string[]) => tourSlides((k) => keys.includes(k)).map((s) => s.title);
  const kpiBody = (keys: string[]) => tourSlides((k) => keys.includes(k)).find((s) => s.title === 'KPIs')!.body;

  test('someone who can do everything gets all five', () => {
    expect(titles(['KPI_VIEW', 'KPI_CREATE', 'KPI_DATA_ENTRY', 'ALERTS_VIEW', 'INSIGHTS_VIEW'])).toEqual([
      'Welcome to KPI Nexus',
      'KPIs',
      'Scorecard and tree',
      'Alerts & digests',
      'AI insights',
    ]);
  });

  test('a Viewer is shown KPIs to read, and no alerts or AI pages', () => {
    const viewer = ['KPI_VIEW', 'DASHBOARD_VIEW', 'REPORTS_VIEW'];
    expect(titles(viewer)).toEqual(['Welcome to KPI Nexus', 'KPIs', 'Scorecard and tree']);
    expect(kpiBody(viewer)).toBe('Open a KPI to see its target, its values and its trend.');
  });

  test('someone who records values is told where their own KPIs are', () => {
    expect(kpiBody(['KPI_VIEW', 'KPI_DATA_ENTRY'])).toContain('under My KPIs');
    expect(kpiBody(['KPI_VIEW', 'KPI_CREATE'])).toContain('Define metrics');
  });

  test('someone with no permissions yet still gets the welcome', () => {
    expect(titles([])).toEqual(['Welcome to KPI Nexus']);
  });
});
