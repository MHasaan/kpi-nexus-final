import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { EmailModule } from '../email/email.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';
import { ActionDispatcherService } from './action-dispatcher.service.js';
import { WorkflowsController } from './workflows.controller.js';
import { WorkflowsService } from './workflows.service.js';

@Module({
  imports: [AuditModule, TasksModule, WebhooksModule, EmailModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, ActionDispatcherService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
