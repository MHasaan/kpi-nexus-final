import { describe, expect, test } from 'vitest';

import { mentionHref, mentionSentence, mentionText } from './mentions-view';

describe('a mention reads as who, where and what', () => {
  test('names the author and the kind of thing', () => {
    expect(mentionSentence({ authorName: 'Ada Admin', entityType: 'kpi' })).toBe('Ada Admin mentioned you on a KPI');
    expect(mentionSentence({ authorName: 'Ada Admin', entityType: 'OBJECTIVE' })).toBe('Ada Admin mentioned you on an objective');
  });

  test('says only what is known', () => {
    expect(mentionSentence({})).toBe('Someone mentioned you');
    expect(mentionSentence({ authorName: 'Ada Admin', entityType: 'spaceship' })).toBe('Ada Admin mentioned you');
  });

  test('links to where the comment is', () => {
    expect(mentionHref({ entityType: 'kpi', entityId: 'k1' })).toBe('/kpis/k1');
    expect(mentionHref({ entityType: 'dashboard', entityId: 'd1' })).toBe('/dashboards/d1');
    expect(mentionHref({ entityType: 'objective', entityId: 'o1' })).toBe('/okrs/o1');
    expect(mentionHref({ entityType: 'alert', entityId: 'a1' })).toBe('/alerts/a1');
    expect(mentionHref({ entityType: 'task', entityId: 't1' })).toBe('/tasks');
    expect(mentionHref({ entityType: 'kpi' })).toBeNull();
    expect(mentionHref({ entityType: 'spaceship', entityId: 'x' })).toBeNull();
  });

  test('the text, or why there is none', () => {
    expect(mentionText({ excerpt: 'Please look' })).toBe('Please look');
    expect(mentionText({ excerpt: null })).toBe('The comment has since been deleted.');
  });
});
