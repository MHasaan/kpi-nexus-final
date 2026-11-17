import { describe, expect, test } from 'vitest';

import { CHANNEL_KINDS, type ChannelForm, EMPTY_CHANNEL_FORM, channelCreateBody, channelEditBody, channelEditForm, channelFormProblem, splitRecipients } from './channel-form';

const form = (patch: Partial<ChannelForm> = {}): ChannelForm => ({ ...EMPTY_CHANNEL_FORM, name: 'Ops', recipients: 'ops@acme.test', ...patch });

describe('adding a channel', () => {
  test('SMS is not offered: it needs a paid provider', () => {
    expect(CHANNEL_KINDS.map((k) => k.value)).toEqual(['EMAIL', 'SLACK', 'TEAMS', 'WEBHOOK', 'IN_APP']);
  });

  test('says what is missing', () => {
    expect(channelFormProblem(form({ name: ' ' }))).toBe('Give the channel a name.');
    expect(channelFormProblem(form({ recipients: '' }))).toBe('Add at least one email address.');
    expect(channelFormProblem(form({ recipients: 'ops@acme.test, nope' }))).toBe('"nope" is not an email address.');
    expect(channelFormProblem(form({ kind: 'SLACK', url: '' }))).toBe('Add the URL this channel posts to.');
    expect(channelFormProblem(form({ kind: 'WEBHOOK', url: 'http://plain.test/hook' }))).toBe('The URL must start with https://');
    expect(channelFormProblem(form({ kind: 'IN_APP', recipients: '' }))).toBeNull();
    expect(channelFormProblem(form())).toBeNull();
  });

  test('the body carries the config in the shape each kind uses', () => {
    expect(channelCreateBody(form({ recipients: 'a@acme.test; b@acme.test\nc@acme.test' }))).toEqual({ name: 'Ops', kind: 'EMAIL', config: { recipients: ['a@acme.test', 'b@acme.test', 'c@acme.test'] } });
    expect(channelCreateBody(form({ kind: 'SLACK', url: ' https://hooks.slack.test/x ' })).config).toEqual({ webhookUrl: 'https://hooks.slack.test/x' });
    expect(channelCreateBody(form({ kind: 'WEBHOOK', url: 'https://api.acme.test/in' })).config).toEqual({ url: 'https://api.acme.test/in' });
    expect(channelCreateBody(form({ kind: 'IN_APP' })).config).toEqual({});
  });
});

describe('editing a channel', () => {
  const slack = { name: 'Ops Slack', kind: 'SLACK' as const, target: 'hooks.slack.test' };
  const mail = { name: 'Ops mail', kind: 'EMAIL' as const, target: 'ops@acme.test, oncall@acme.test' };

  test('email addresses are shown to be edited; a webhook URL is not', () => {
    expect(channelEditForm(mail)).toEqual({ name: 'Ops mail', kind: 'EMAIL', recipients: 'ops@acme.test, oncall@acme.test', url: '' });
    expect(channelEditForm(slack)).toEqual({ name: 'Ops Slack', kind: 'SLACK', recipients: '', url: '' });
  });

  test('a blank URL keeps the saved one', () => {
    const edited = { ...channelEditForm(slack), name: 'Ops alerts' };
    expect(channelFormProblem(edited, true)).toBeNull();
    expect(channelEditBody(slack, edited)).toEqual({ name: 'Ops alerts' });
  });

  test('a new URL replaces it; an unchanged name is not sent', () => {
    const edited = { ...channelEditForm(slack), url: 'https://hooks.slack.test/new' };
    expect(channelEditBody(slack, edited)).toEqual({ config: { webhookUrl: 'https://hooks.slack.test/new' } });
  });

  test('what is typed is still checked', () => {
    expect(channelFormProblem({ ...channelEditForm(mail), recipients: 'nope' }, true)).toBe('"nope" is not an email address.');
    expect(channelFormProblem({ ...channelEditForm(slack), url: 'ftp://x' }, true)).toBe('The URL must start with https://');
  });
});

test('splitRecipients takes commas, semicolons and new lines', () => {
  expect(splitRecipients(' a@x.test ,b@x.test;\n c@x.test ,, ')).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
});
