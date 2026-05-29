import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { AlertsService, type PublicAlert } from './alerts.service.js';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @RequirePermissions(PermissionKey.ALERTS_VIEW)
  list(
    @Query('status') status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED',
    @Query('severity') severity?: 'LOW' | 'MEDIUM' | 'HIGH',
    @Query('kpiId') kpiId?: string,
    @Query('limit') limit?: string,
  ): Promise<PublicAlert[]> {
    return this.alerts.list({
      status,
      severity,
      kpiId,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get('unread-count')
  @RequirePermissions(PermissionKey.ALERTS_VIEW)
  async unreadCount(): Promise<{ count: number }> {
    return { count: await this.alerts.unreadCount() };
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.ALERTS_VIEW)
  getById(@Param('id') id: string): Promise<PublicAlert> {
    return this.alerts.getById(id);
  }

  @Post(':id/acknowledge')
  @RequirePermissions(PermissionKey.ALERTS_VIEW)
  acknowledge(@Param('id') id: string): Promise<PublicAlert> {
    return this.alerts.acknowledge(id);
  }

  @Post(':id/resolve')
  @RequirePermissions(PermissionKey.ALERTS_VIEW)
  resolve(@Param('id') id: string): Promise<PublicAlert> {
    return this.alerts.resolve(id);
  }
}
