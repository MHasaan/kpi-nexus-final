import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MfaController } from './mfa.controller.js';
import { MfaService } from './mfa.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
