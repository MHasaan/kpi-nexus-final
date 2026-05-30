import { Controller, Get, Query } from '@nestjs/common';

import { type ActivityPage, ActivityService } from './activity.service.js';

/** Activity feed — authenticated; admins see all, others see their own. */
@Controller('activity')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<ActivityPage> {
    return this.activity.list({
      userId,
      entityType,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      cursor,
      limit: limit ? Number(limit) || 25 : undefined,
    });
  }
}
