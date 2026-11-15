/**
 * The one-time link a Slack user gets to connect their Slack identity to their
 * KPI Nexus account: a signed, short-lived token naming the org, the Slack
 * workspace and the Slack user. It can't be forged or reused after it expires.
 */
import { describe, expect, it } from 'vitest';

import { signSlackLinkToken, verifySlackLinkToken } from './slack-link-token.js';

const SECRET = 'test-secret';
const claims = { organizationId: 'org_1', teamId: 'T1', slackUserId: 'U1' };

describe('Slack link token', () => {
  it('round-trips the claims while valid', () => {
    const token = signSlackLinkToken(claims, SECRET, 1_000);
    expect(verifySlackLinkToken(token, SECRET, 1_000 + 60)).toEqual(claims);
  });

  it('expires after 10 minutes', () => {
    const token = signSlackLinkToken(claims, SECRET, 1_000);
    expect(verifySlackLinkToken(token, SECRET, 1_000 + 601)).toBeNull();
  });

  it('rejects a tampered token or one signed with another secret', () => {
    const token = signSlackLinkToken(claims, SECRET, 1_000);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, slackUserId: 'U2', exp: 2_000 })).toString('base64url');
    expect(verifySlackLinkToken(`${forged}.${sig}`, SECRET, 1_000)).toBeNull();
    expect(verifySlackLinkToken(token, 'other-secret', 1_000)).toBeNull();
    expect(verifySlackLinkToken(`${body}`, SECRET, 1_000)).toBeNull();
    expect(verifySlackLinkToken('garbage', SECRET, 1_000)).toBeNull();
  });
});
