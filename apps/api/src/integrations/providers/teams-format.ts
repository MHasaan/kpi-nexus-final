/**
 * Pure Microsoft Teams Adaptive Card builder for alerts. Posted to an incoming
 * webhook URL (no OAuth). Severity drives the card's accent colour.
 */

const SEVERITY_COLOR: Record<string, string> = { LOW: 'warning', MEDIUM: 'attention', HIGH: 'attention' };

export interface TeamsAlertInput {
  alertId: string;
  kpiName: string;
  severity: string;
  message: string;
}

export function buildTeamsAdaptiveCard(input: TeamsAlertInput): { type: 'message'; attachments: unknown[] } {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', size: 'Large', weight: 'Bolder', color: SEVERITY_COLOR[input.severity] ?? 'default', text: `${input.kpiName} — ${input.severity}` },
            { type: 'TextBlock', wrap: true, text: input.message },
          ],
          actions: [
            { type: 'Action.Submit', title: 'Acknowledge', data: { action: 'acknowledge_alert', alertId: input.alertId } },
          ],
        },
      },
    ],
  };
}
