import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long a Slack user has to open their link (seconds). */
export const SLACK_LINK_TTL_SECONDS = 600;

export interface SlackLinkClaims {
  organizationId: string;
  teamId: string;
  slackUserId: string;
}

const sign = (body: string, secret: string) => createHmac('sha256', `slack-link:${secret}`).update(body).digest('base64url');

/** `<base64url(json)>.<hmac>`: the claims plus an expiry, signed with the server secret. */
export function signSlackLinkToken(claims: SlackLinkClaims, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const body = Buffer.from(JSON.stringify({ ...claims, exp: nowSeconds + SLACK_LINK_TTL_SECONDS })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

/** The claims, or null when the token is malformed, forged or expired. */
export function verifySlackLinkToken(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): SlackLinkClaims | null {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SlackLinkClaims & { exp: number };
    if (typeof c.exp !== 'number' || c.exp < nowSeconds) return null;
    if (!c.organizationId || !c.teamId || !c.slackUserId) return null;
    return { organizationId: c.organizationId, teamId: c.teamId, slackUserId: c.slackUserId };
  } catch {
    return null;
  }
}
