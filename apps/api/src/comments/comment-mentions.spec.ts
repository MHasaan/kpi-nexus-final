import { describe, expect, test } from 'vitest';

import { dedupeMentionTargets, extractMentionHandles } from './comment-mentions.js';

describe('extractMentionHandles', () => {
  test('extracts a single @handle', () => {
    expect(extractMentionHandles('great work @alice')).toEqual(['alice']);
  });

  test('extracts multiple handles, deduped, order-preserving', () => {
    expect(extractMentionHandles('@bob and @alice and @bob again')).toEqual(['bob', 'alice']);
  });

  test('supports underscores and hyphens in handles', () => {
    expect(extractMentionHandles('ping @data_team and @ops-lead')).toEqual(['data_team', 'ops-lead']);
  });

  test('ignores emails (no leading-space @) and bare @', () => {
    expect(extractMentionHandles('mail me at x@y.com or just @ nothing')).toEqual([]);
  });

  test('returns [] for empty / no-mention body', () => {
    expect(extractMentionHandles('no mentions here')).toEqual([]);
    expect(extractMentionHandles('')).toEqual([]);
  });
});

describe('dedupeMentionTargets', () => {
  test('dedupes userIds', () => {
    expect(dedupeMentionTargets(['u1', 'u2', 'u1'], 'author')).toEqual(['u1', 'u2']);
  });

  test('strips the author (no self-mention)', () => {
    expect(dedupeMentionTargets(['u1', 'author', 'u2'], 'author')).toEqual(['u1', 'u2']);
  });

  test('returns [] when only self is mentioned', () => {
    expect(dedupeMentionTargets(['author'], 'author')).toEqual([]);
  });

  test('returns [] for empty input', () => {
    expect(dedupeMentionTargets([], 'author')).toEqual([]);
  });
});
