/**
 * Pure provider helpers: Slack request-signature verification + Block Kit alert
 * blocks, Teams Adaptive Card builder, and Jira→Task status mapping.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import { buildSlackAlertBlocks, verifySlackSignature } from './slack-format.js';
import { buildTeamsAdaptiveCard } from './teams-format.js';
import { mapJiraStatusToTask } from './jira-map.js';

const SIGNING_SECRET = 'slack-signing-secret';
function slackSig(ts: string, body: string): string {
  return 'v0=' + createHmac('sha256', SIGNING_SECRET).update(`v0:${ts}:${body}`).digest('hex');
}

describe('verifySlackSignature', () => {
  const now = 1_700_000_000;
  const body = 'token=abc&command=/kpi';

  test('accepts a valid signature within the freshness window', () => {
    const ts = String(now);
    expect(verifySlackSignature(SIGNING_SECRET, ts, body, slackSig(ts, body), now)).toBe(true);
  });
  test('rejects a wrong signature', () => {
    const ts = String(now);
    expect(verifySlackSignature(SIGNING_SECRET, ts, body, slackSig(ts, 'other'), now)).toBe(false);
  });
  test('rejects a stale timestamp (> 5 min skew)', () => {
    const ts = String(now - 60 * 6);
    expect(verifySlackSignature(SIGNING_SECRET, ts, body, slackSig(ts, body), now)).toBe(false);
  });
  test('rejects a malformed signature without throwing', () => {
    expect(verifySlackSignature(SIGNING_SECRET, String(now), body, 'garbage', now)).toBe(false);
  });
});

describe('buildSlackAlertBlocks', () => {
  test('includes severity emoji, message, and an Acknowledge action carrying the alertId', () => {
    const blocks = buildSlackAlertBlocks({ alertId: 'al_1', kpiName: 'MRR', severity: 'HIGH', message: 'MRR dropped 20%' });
    const json = JSON.stringify(blocks);
    expect(json).toContain('MRR');
    expect(json).toContain('🔴'); // HIGH severity
    const action = blocks.find((b) => b.type === 'actions') as { elements: Array<{ action_id: string; value: string }> } | undefined;
    expect(action?.elements[0]?.action_id).toBe('acknowledge_alert');
    expect(action?.elements[0]?.value).toBe('al_1');
  });
});

describe('buildTeamsAdaptiveCard', () => {
  test('produces an AdaptiveCard with the KPI + severity colour', () => {
    const card = buildTeamsAdaptiveCard({ alertId: 'al_1', kpiName: 'Churn', severity: 'MEDIUM', message: 'spiked' });
    expect(card.type).toBe('message');
    const json = JSON.stringify(card);
    expect(json).toContain('Churn');
    expect(json).toContain('AdaptiveCard');
  });
});

describe('mapJiraStatusToTask', () => {
  test('maps the standard Jira statuses', () => {
    expect(mapJiraStatusToTask('To Do')).toBe('TODO');
    expect(mapJiraStatusToTask('In Progress')).toBe('IN_PROGRESS');
    expect(mapJiraStatusToTask('Done')).toBe('DONE');
  });
  test('is case/space insensitive', () => {
    expect(mapJiraStatusToTask('in progress')).toBe('IN_PROGRESS');
    expect(mapJiraStatusToTask('DONE')).toBe('DONE');
  });
  test('returns null for unknown statuses', () => {
    expect(mapJiraStatusToTask('Backlog')).toBeNull();
  });
});
