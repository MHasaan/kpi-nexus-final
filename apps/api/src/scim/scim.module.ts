import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { ScimController } from './scim.controller.js';
import { ScimGroupsService } from './scim-groups.service.js';
import { ScimTokenService } from './scim-token.service.js';
import { ScimTokensController } from './scim-tokens.controller.js';
import { ScimUsersService } from './scim-users.service.js';

@Module({
  imports: [AuditModule],
  controllers: [ScimController, ScimTokensController],
  providers: [ScimUsersService, ScimGroupsService, ScimTokenService],
  exports: [ScimTokenService],
})
export class ScimModule {}
