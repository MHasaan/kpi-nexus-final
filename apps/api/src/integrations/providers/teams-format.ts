/**
 * Pure Microsoft Teams Adaptive Card builder for alerts, posted to an incoming
 * webhook (Teams Workflows / Power Automate). Severity drives the title colour.
 * A webhook card cannot post back (Action.Submit needs a Teams bot), so its one
 * action opens the alert in KPI Nexus, where it can be acknowledged.
 */

const SEVERITY_COLOR: Record<string, string> = { LOW: 'warning', MEDIUM: 'warning', HIGH: 'attention' };

export interface TeamsAlertInput {
  alertId: string;
  title: string;
  severity: string;
  message: string;
  /** Absolute URL of the alert in the web app. */
  alertUrl: string;
}

export function buildTeamsAdaptiveCard(input: TeamsAlertInput): { type: 'message'; attachments: unknown[] } {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', size: 'Large', weight: 'Bolder', wrap: true, color: SEVERITY_COLOR[input.severity] ?? 'default', text: input.title },
            { type: 'TextBlock', wrap: true, text: input.message },
            {
              type: 'FactSet',
              facts: [
                { title: 'Severity', value: input.severity },
                { title: 'Alert', value: input.alertId },
              ],
            },
          ],
          actions: [{ type: 'Action.OpenUrl', title: 'Open in KPI Nexus', url: input.alertUrl }],
        },
      },
    ],
  };
}
