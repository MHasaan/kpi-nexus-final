import { describe, expect, it } from 'vitest';

import { DEFAULT_TASKS, countComplete, mergeChecklist } from './setup-checklist.defaults.js';

describe('DEFAULT_TASKS', () => {
  it('defines exactly 14 tasks with unique keys', () => {
    expect(DEFAULT_TASKS).toHaveLength(14);
    expect(new Set(DEFAULT_TASKS.map((t) => t.key)).size).toBe(14);
  });

  it('every task has a key, category, and label', () => {
    for (const t of DEFAULT_TASKS) {
      expect(t.key).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
  });
});

describe('mergeChecklist', () => {
  it('returns 14 pending items when nothing is persisted', () => {
    const items = mergeChecklist([]);
    expect(items).toHaveLength(14);
    expect(items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('applies a persisted status to its task and leaves the rest pending', () => {
    const items = mergeChecklist([{ key: 'mfa', status: 'complete' }]);
    expect(items.find((i) => i.key === 'mfa')!.status).toBe('complete');
    expect(items.filter((i) => i.status === 'pending')).toHaveLength(13);
  });

  it('preserves category + label from the defaults', () => {
    const item = mergeChecklist([{ key: 'sso', status: 'dismissed' }]).find((i) => i.key === 'sso')!;
    expect(item.category).toBe('Security');
    expect(item.label).toContain('SSO');
    expect(item.status).toBe('dismissed');
  });

  it('ignores persisted rows whose key is not a default task', () => {
    const items = mergeChecklist([{ key: 'ghost_task', status: 'complete' }]);
    expect(items).toHaveLength(14);
    expect(items.every((i) => i.status === 'pending')).toBe(true);
  });
});

describe('countComplete', () => {
  it('counts only complete items', () => {
    const items = mergeChecklist([
      { key: 'mfa', status: 'complete' },
      { key: 'sso', status: 'complete' },
      { key: 'channels', status: 'dismissed' },
    ]);
    expect(countComplete(items)).toBe(2);
  });
});
