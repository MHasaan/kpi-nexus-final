import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { Public } from '../../rbac/decorators/public.decorator.js';
import { JiraService, type JiraWebhookPayload } from './jira.service.js';
import { type SlackInteractivePayload, SlackService } from './slack.service.js';
import { verifySlackSignature } from './slack-format.js';

/**
 * Public provider callbacks. Slack interactive button clicks (signature-verified
 * when SLACK_SIGNING_SECRET is set) and Jira issue-update webhooks. The acting
 * org/principal is resolved inside the services from the external identity.
 */
@Controller('integrations')
export class IntegrationProvidersController {
  constructor(
    private readonly slack: SlackService,
    private readonly jira: JiraService,
  ) {}

  @Public()
  @Post('slack/interactive')
  @HttpCode(HttpStatus.OK)
  async slackInteractive(
    @Body() body: { payload?: string } & SlackInteractivePayload,
    @Headers('x-slack-signature') signature?: string,
    @Headers('x-slack-request-timestamp') timestamp?: string,
  ): Promise<{ handled: boolean }> {
    // Slack posts urlencoded with a `payload` JSON field; fall back to a JSON body.
    const payload: SlackInteractivePayload = body.payload
      ? (JSON.parse(body.payload) as SlackInteractivePayload)
      : body;

    const secret = process.env.SLACK_SIGNING_SECRET;
    if (secret && signature && timestamp) {
      const raw = body.payload ? `payload=${encodeURIComponent(body.payload)}` : JSON.stringify(body);
      if (!verifySlackSignature(secret, timestamp, raw, signature)) {
        return { handled: false };
      }
    }
    return this.slack.handleInteractive(payload);
  }

  @Public()
  @Post('jira/webhook')
  @HttpCode(HttpStatus.OK)
  jiraWebhook(@Body() body: JiraWebhookPayload): Promise<{ updated: boolean }> {
    return this.jira.handleWebhook(body);
  }
}
