import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { EmailModule } from '../email/email.module.js';
import { PasswordController } from './password.controller.js';
import { PasswordResetService } from './password-reset.service.js';

@Module({
  imports: [AuthModule, EmailModule],
  controllers: [PasswordController],
  providers: [PasswordResetService],
  exports: [PasswordResetService],
})
export class PasswordModule {}
