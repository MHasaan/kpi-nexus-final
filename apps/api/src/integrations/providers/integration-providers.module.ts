import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AlertsModule } from '../../alerts/alerts.module.js';
import { queueProcessors } from '../../config/queue-workers.js';
import { JWT_SECRET_SPEC, resolveSecret } from '../../config/secrets.js';
import { webAppUrl } from '../../email/web-app-url.js';
import { KpisModule } from '../../kpis/kpis.module.js';
import { NlqModule } from '../../nlq/nlq.module.js';
import { RbacModule } from '../../rbac/rbac.module.js';
import { IntegrationsModule } from '../integrations.module.js';
import { IntegrationProvidersController } from './integration-providers.controller.js';
import { JiraService } from './jira.service.js';
import { SLACK_COMMAND_QUEUE, SlackCommandProducer } from './slack-command.producer.js';
import { SlackCommandProcessor } from './slack-command.processor.js';
import { SLACK_COMMAND_CONFIG, type SlackCommandConfig, SlackCommandService } from './slack-command.service.js';
import { SlackService } from './slack.service.js';

/**
 * Slack/Jira provider handlers (interactive callbacks, the `/kpi` command and
 * issue webhooks). Teams posting uses the pure adaptive-card builder via the
 * notification channel path; OAuth connect flows are driven through
 * IntegrationsModule.
 */
@Module({
  imports: [AlertsModule, IntegrationsModule, KpisModule, NlqModule, RbacModule, BullModule.registerQueue({ name: SLACK_COMMAND_QUEUE })],
  controllers: [IntegrationProvidersController],
  providers: [
    SlackService,
    JiraService,
    SlackCommandService,
    SlackCommandProducer,
    {
      provide: SLACK_COMMAND_CONFIG,
      // Link tokens are signed with a key derived from JWT_SECRET (see slack-link-token).
      useFactory: (): SlackCommandConfig => ({ linkSecret: resolveSecret(JWT_SECRET_SPEC), webAppUrl: (path) => webAppUrl(path) }),
    },
    ...queueProcessors([SlackCommandProcessor]),
  ],
  exports: [SlackService, JiraService],
})
export class IntegrationProvidersModule {}
