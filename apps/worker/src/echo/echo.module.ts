import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EchoProcessor } from './echo.processor.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'echo' })],
  providers: [EchoProcessor],
})
export class EchoModule {}
