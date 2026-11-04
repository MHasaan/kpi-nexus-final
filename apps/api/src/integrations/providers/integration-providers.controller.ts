import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import { Public } from '../../rbac/decorators/public.decorator.js';
import { JiraService, type JiraWebhookPayload } from './jira.service.js';
import { type SlackInteractivePayload, SlackService } from './slack.service.js';
import { verifySlackSignature } from './slack-format.js';

/**
 * Public provider callbacks. Slack interactive button clicks (always
 * signature-verified; requires SLACK_SIGNING_SECRET) and per-connection, secret-authenticated
 * Jira issue-update webhooks. The acting org is resolved inside the services
 * from the external identity / connection.
 */
@Controller('integrations')
export class IntegrationProvidersController {
  constructor(
    private readonly slack: SlackService,
    private readonly jira: JiraService,
  ) {}

  /**
   * Slack interactive button callbacks. Every request must carry a valid
   * signature over the RAW body (`main.ts` enables `rawBody`); a missing
   * secret, missing headers or a bad/stale signature is rejected with 401
   * before anything is parsed or acted on.
   */
  @Public()
  @Post('slack/interactive')
  @HttpCode(HttpStatus.OK)
  async slackInteractive(
    @Req() req: { rawBody?: Buffer },
    @Body() body: { payload?: string } & SlackInteractivePayload,
    @Headers('x-slack-signature') signature?: string,
    @Headers('x-slack-request-timestamp') timestamp?: string,
  ): Promise<{ handled: boolean }> {
    const secret = process.env.SLACK_SIGNING_SECRET;
    if (
      !secret ||
      !signature ||
      !timestamp ||
      !req.rawBody ||
      !verifySlackSignature(secret, timestamp, req.rawBody.toString('utf8'), signature)
    ) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid Slack signature' });
    }

    // Slack posts urlencoded with a `payload` JSON field; fall back to a JSON body.
    const payload: SlackInteractivePayload = body.payload
      ? (JSON.parse(body.payload) as SlackInteractivePayload)
      : body;
    return this.slack.handleInteractive(payload);
  }

  /**
   * Jira issue webhook for one connection. Register in Jira as
   * `<api>/integrations/jira/webhook/<connectionId>?secret=<webhookSecret>`
   * (Jira's webhook UI can't add headers, so the query string carries the
   * secret; `x-webhook-secret` is accepted too).
   */
  @Public()
  @Post('jira/webhook/:connectionId')
  @HttpCode(HttpStatus.OK)
  jiraWebhook(
    @Param('connectionId') connectionId: string,
    @Body() body: JiraWebhookPayload,
    @Query('secret') querySecret?: string,
    @Headers('x-webhook-secret') headerSecret?: string,
  ): Promise<{ updated: boolean }> {
    return this.jira.handleWebhook(connectionId, headerSecret ?? querySecret, body);
  }
}
