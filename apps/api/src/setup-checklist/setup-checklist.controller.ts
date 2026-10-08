import { Controller, Get, Param, Post } from '@nestjs/common';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type ChecklistView, SetupChecklistService } from './setup-checklist.service.js';

/**
 * Setup checklist. The checklist is org-wide, so any member may read progress,
 * but changing an item's status requires ORG_SETTINGS (BE-022).
 */
@Controller('setup-checklist')
export class SetupChecklistController {
  constructor(private readonly checklist: SetupChecklistService) {}

  @Get()
  list(): Promise<ChecklistView> {
    return this.checklist.list();
  }

  @Post(':key/complete')
  @RequirePermissions('ORG_SETTINGS')
  complete(@Param('key') key: string): Promise<ChecklistView> {
    return this.checklist.markStatus(key, 'complete');
  }

  @Post(':key/dismiss')
  @RequirePermissions('ORG_SETTINGS')
  dismiss(@Param('key') key: string): Promise<ChecklistView> {
    return this.checklist.markStatus(key, 'dismissed');
  }

  @Post(':key/reset')
  @RequirePermissions('ORG_SETTINGS')
  reset(@Param('key') key: string): Promise<ChecklistView> {
    return this.checklist.markStatus(key, 'pending');
  }
}
