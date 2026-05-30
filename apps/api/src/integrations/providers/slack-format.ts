import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure Slack helpers: request-signature verification (Slack's v0 scheme) and
 * Block Kit message construction. No Nest/Prisma so they unit-test in isolation.
 */

const MAX_SKEW_SECONDS = 60 * 5;

export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > MAX_SKEW_SECONDS) return false;
  const expected = 'v0=' + createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const SEVERITY_EMOJI: Record<string, string> = { LOW: '🟡', MEDIUM: '🟠', HIGH: '🔴' };

export interface SlackAlertInput {
  alertId: string;
  kpiName: string;
  severity: string;
  message: string;
}

export interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

export function buildSlackAlertBlocks(input: SlackAlertInput): SlackBlock[] {
  const emoji = SEVERITY_EMOJI[input.severity] ?? '⚪';
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${emoji} *${input.kpiName}* — ${input.severity}\n${input.message}` },
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Acknowledge' }, action_id: 'acknowledge_alert', value: input.alertId, style: 'primary' },
        { type: 'button', text: { type: 'plain_text', text: 'Snooze 1h' }, action_id: 'snooze_alert', value: input.alertId },
      ],
    },
  ];
}
