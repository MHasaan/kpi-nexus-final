import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import {
  NotificationDeliveriesService,
  type PublicDelivery,
} from './notification-deliveries.service.js';

/** DLQ + delivery-history admin endpoints. */
@Controller('notification-deliveries')
export class NotificationsController {
  constructor(private readonly deliveries: NotificationDeliveriesService) {}

  @Get()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  list(
    @Query('status') status?: 'PENDING' | 'SENT' | 'FAILED' | 'SUPPRESSED',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<PublicDelivery[]> {
    return this.deliveries.list({
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Post(':id/retry')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.OK)
  retry(@Param('id') id: string): Promise<PublicDelivery> {
    return this.deliveries.retry(id);
  }
}
