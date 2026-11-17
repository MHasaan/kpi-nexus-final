import { describe, expect, test } from 'vitest';

import { channelCannotDeliver, channelConfigProblem, channelTarget, emailRecipients } from './channel-config.js';

describe('channelConfigProblem', () => {
  test('an email channel needs somewhere to send', () => {
    expect(channelConfigProblem('EMAIL', {})).toMatch(/at least one email address/);
    expect(channelConfigProblem('EMAIL', { recipients: [] })).toMatch(/at least one email address/);
    expect(channelConfigProblem('EMAIL', { recipients: ['  '] })).toMatch(/at least one email address/);
    expect(channelConfigProblem('EMAIL', { recipients: ['ops@acme.test'] })).toBeNull();
    expect(channelConfigProblem('EMAIL', { to: 'ops@acme.test' })).toBeNull();
  });

  test('each address must be one; the bad one is named', () => {
    expect(channelConfigProblem('EMAIL', { recipients: ['ops@acme.test', 'not-an-address'] })).toBe('"not-an-address" is not an email address.');
  });

  test('at most fifty recipients', () => {
    const many = Array.from({ length: 51 }, (_, i) => `p${i}@acme.test`);
    expect(channelConfigProblem('EMAIL', { recipients: many })).toMatch(/at most 50/);
  });

  test('Slack, Teams and webhook channels need their URL', () => {
    expect(channelConfigProblem('SLACK', {})).toMatch(/webhook URL/);
    expect(channelConfigProblem('TEAMS', { webhookUrl: ' ' })).toMatch(/webhook URL/);
    expect(channelConfigProblem('WEBHOOK', { webhookUrl: 'https://x.test' })).toMatch(/URL this channel posts to/);
    expect(channelConfigProblem('SLACK', { webhookUrl: 'https://hooks.slack.test/abc' })).toBeNull();
    expect(channelConfigProblem('WEBHOOK', { url: 'https://x.test/hook' })).toBeNull();
  });

  test('in-app needs nothing', () => {
    expect(channelConfigProblem('IN_APP', {})).toBeNull();
  });
});

describe('channelTarget', () => {
  test('email addresses in full; only the host of a webhook URL', () => {
    expect(channelTarget('EMAIL', { recipients: ['a@acme.test', 'b@acme.test'] })).toBe('a@acme.test, b@acme.test');
    expect(channelTarget('SLACK', { webhookUrl: 'https://hooks.slack.test/services/T000/B000/secret-token' })).toBe('hooks.slack.test');
    expect(channelTarget('WEBHOOK', { url: 'https://api.acme.test:8443/in?key=secret' })).toBe('api.acme.test:8443');
  });

  test('nothing to show for in-app, or a config that cannot be read', () => {
    expect(channelTarget('IN_APP', {})).toBeNull();
    expect(channelTarget('WEBHOOK', { url: 'not a url' })).toBeNull();
    expect(channelTarget('EMAIL', {})).toBeNull();
  });
});

describe('channelCannotDeliver', () => {
  test('SMS says it is not connected instead of pretending', () => {
    expect(channelCannotDeliver('SMS', { fromNumber: '+15551234567' })).toMatch(/SMS is not connected/);
  });

  test('a channel saved before the rules existed, with nowhere to send, says so', () => {
    expect(channelCannotDeliver('EMAIL', {})).toMatch(/at least one email address/);
    expect(channelCannotDeliver('EMAIL', { recipients: ['ops@acme.test'] })).toBeNull();
    expect(channelCannotDeliver('IN_APP', {})).toBeNull();
  });
});

describe('emailRecipients', () => {
  test('trims, and drops blanks and non-strings', () => {
    expect(emailRecipients({ recipients: [' a@acme.test ', '', 7, null] })).toEqual(['a@acme.test']);
  });
});
