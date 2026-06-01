import { Controller, Get, Query } from '@nestjs/common';
import type { AuditAction } from '@kpi-nexus/db';
import { PermissionKey } from '@kpi-nexus/contracts';

import { RequireAnyPermission } from '../rbac/decorators/require-permissions.decorator.js';
import { AuditService, type PublicAuditLog } from './audit.service.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  // ADR-001: AUDIT_VIEW grants compliance read without full ORG_SETTINGS; ORG_SETTINGS kept for parity.
  @RequireAnyPermission(PermissionKey.AUDIT_VIEW, PermissionKey.ORG_SETTINGS)
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<PublicAuditLog[]> {
    return this.audit.list({
      entityType,
      entityId,
      userId,
      action: action as AuditAction | undefined,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }
}
