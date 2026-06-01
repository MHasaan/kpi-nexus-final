import { Global, Module } from '@nestjs/common';

import { PermissionsGuard } from './guards/permissions.guard.js';
import { AccessContextService } from './services/access-context.service.js';
import { PermissionResolverService } from './services/permission-resolver.service.js';

@Global()
@Module({
  providers: [PermissionResolverService, AccessContextService, PermissionsGuard],
  exports: [PermissionResolverService, AccessContextService, PermissionsGuard],
})
export class RbacModule {}
