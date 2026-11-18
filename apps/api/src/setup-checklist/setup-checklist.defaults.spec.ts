import { describe, expect, it } from 'vitest';

import { DEFAULT_TASKS, countComplete, mergeChecklist, resolveChecklist } from './setup-checklist.defaults.js';

describe('DEFAULT_TASKS', () => {
  it('defines exactly 13 tasks with unique keys', () => {
    expect(DEFAULT_TASKS).toHaveLength(13);
    expect(new Set(DEFAULT_TASKS.map((t) => t.key)).size).toBe(13);
  });

  it('every task has a key, category, and label', () => {
    for (const t of DEFAULT_TASKS) {
      expect(t.key).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
  });
});

describe('DEFAULT_TASKS — what a person reads (plan 3.3)', () => {
  it('every task says where to go to do it', () => {
    for (const t of DEFAULT_TASKS) {
      expect(t.href, t.key).toMatch(/^\/[a-z]/);
    }
  });

  it('no label carries a build-phase note', () => {
    for (const t of DEFAULT_TASKS) {
      expect(t.label, t.key).not.toMatch(/\bP\d\b|post-|\(/i);
    }
  });

  // Flow walk, 2026-11-18: the list began with "Invite your team" and had no step for the first
  // thing anyone does; "Record or import KPI values" led to the page that imports KPI definitions;
  // and three steps were for single sign-on and custom domains, which do not work yet.
  it('starts with the product itself: a KPI, a value, something to look at, something to warn you', () => {
    expect(DEFAULT_TASKS.slice(0, 5).map((t) => t.key)).toEqual(['first_kpi', 'historical_import', 'default_dashboard', 'alert_rule', 'remaining_invites']);
  });

  it('recording a value leads to the KPI list, where values are recorded', () => {
    expect(DEFAULT_TASKS.find((t) => t.key === 'first_kpi')!.href).toBe('/kpis/new');
    expect(DEFAULT_TASKS.find((t) => t.key === 'historical_import')!.href).toBe('/kpis');
  });

  it('lists nothing that cannot be done yet: no single sign-on, no custom domain', () => {
    const keys = DEFAULT_TASKS.map((t) => t.key);
    for (const gone of ['sso', 'custom_domain', 'domain_verification']) expect(keys).not.toContain(gone);
    expect(DEFAULT_TASKS.map((t) => t.href).filter((h) => /sso|custom-domain/.test(h))).toEqual([]);
  });
});

describe('resolveChecklist — done because it is done, not because someone ticked it', () => {
  it('a task whose work exists is complete, and says it was detected', () => {
    const items = resolveChecklist([], new Set(['channels']));
    expect(items.find((i) => i.key === 'channels')).toMatchObject({ status: 'complete', detected: true });
    expect(items.filter((i) => i.status === 'pending')).toHaveLength(12);
  });

  it('a task ticked by hand is complete without being detected', () => {
    const item = resolveChecklist([{ key: 'compliance_review', status: 'complete' }], new Set()).find((i) => i.key === 'compliance_review')!;
    expect(item).toMatchObject({ status: 'complete', detected: false });
  });

  it('dismissed stays dismissed even if the work later exists', () => {
    const item = resolveChecklist([{ key: 'ai_tuning', status: 'dismissed' }], new Set(['ai_tuning'])).find((i) => i.key === 'ai_tuning')!;
    expect(item.status).toBe('dismissed');
  });

  it('ignores a detected key that is not a task', () => {
    expect(resolveChecklist([], new Set(['ghost'])).every((i) => i.status === 'pending')).toBe(true);
  });
});

describe('mergeChecklist', () => {
  it('returns 13 pending items when nothing is persisted', () => {
    const items = mergeChecklist([]);
    expect(items).toHaveLength(13);
    expect(items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('applies a persisted status to its task and leaves the rest pending', () => {
    const items = mergeChecklist([{ key: 'mfa', status: 'complete' }]);
    expect(items.find((i) => i.key === 'mfa')!.status).toBe('complete');
    expect(items.filter((i) => i.status === 'pending')).toHaveLength(12);
  });

  it('preserves category + label from the defaults', () => {
    const item = mergeChecklist([{ key: 'ai_tuning', status: 'dismissed' }]).find((i) => i.key === 'ai_tuning')!;
    expect(item.category).toBe('AI');
    expect(item.label).toBe('Review AI settings');
    expect(item.href).toBe('/settings/ai');
    expect(item.status).toBe('dismissed');
  });

  it('a status stored for a task that was taken off the list is ignored', () => {
    const items = mergeChecklist([{ key: 'sso', status: 'complete' }]);
    expect(items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('ignores persisted rows whose key is not a default task', () => {
    const items = mergeChecklist([{ key: 'ghost_task', status: 'complete' }]);
    expect(items).toHaveLength(13);
    expect(items.every((i) => i.status === 'pending')).toBe(true);
  });
});

describe('countComplete', () => {
  it('counts only complete items', () => {
    const items = mergeChecklist([
      { key: 'mfa', status: 'complete' },
      { key: 'okrs', status: 'complete' },
      { key: 'channels', status: 'dismissed' },
    ]);
    expect(countComplete(items)).toBe(2);
  });
});
