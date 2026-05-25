import { Global, Module } from '@nestjs/common';

import { PermissionsGuard } from './guards/permissions.guard.js';
import { PermissionResolverService } from './services/permission-resolver.service.js';

@Global()
@Module({
  providers: [PermissionResolverService, PermissionsGuard],
  exports: [PermissionResolverService, PermissionsGuard],
})
export class RbacModule {}
