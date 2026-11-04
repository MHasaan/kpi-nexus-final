import { Module } from '@nestjs/common';

import { AlertsModule } from '../../alerts/alerts.module.js';
import { IntegrationsModule } from '../integrations.module.js';
import { IntegrationProvidersController } from './integration-providers.controller.js';
import { JiraService } from './jira.service.js';
import { SlackService } from './slack.service.js';

/**
 * Slack/Jira provider handlers (interactive callbacks + issue webhooks). Teams
 * posting uses the pure adaptive-card builder via the notification channel path;
 * OAuth connect flows are driven through IntegrationsModule.
 */
@Module({
  imports: [AlertsModule, IntegrationsModule],
  controllers: [IntegrationProvidersController],
  providers: [SlackService, JiraService],
  exports: [SlackService, JiraService],
})
export class IntegrationProvidersModule {}
