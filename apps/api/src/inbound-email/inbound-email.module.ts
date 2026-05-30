import { Module } from '@nestjs/common';

import { CommentsModule } from '../comments/comments.module.js';
import { InboundEmailController } from './inbound-email.controller.js';
import { InboundEmailService } from './inbound-email.service.js';

@Module({
  imports: [CommentsModule],
  controllers: [InboundEmailController],
  providers: [InboundEmailService],
  exports: [InboundEmailService],
})
export class InboundEmailModule {}
