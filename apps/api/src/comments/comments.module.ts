import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { MentionsController } from './mentions.controller.js';
import { MentionsService } from './mentions.service.js';

@Module({
  imports: [AuditModule],
  controllers: [CommentsController, MentionsController],
  providers: [CommentsService, MentionsService],
  exports: [CommentsService, MentionsService],
})
export class CommentsModule {}
