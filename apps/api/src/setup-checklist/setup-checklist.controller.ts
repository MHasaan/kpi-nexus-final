import { Controller, Get, Param, Post } from '@nestjs/common';

import { type ChecklistView, SetupChecklistService } from './setup-checklist.service.js';

/** Setup checklist — authenticated (any role); no specific permission. */
@Controller('setup-checklist')
export class SetupChecklistController {
  constructor(private readonly checklist: SetupChecklistService) {}

  @Get()
  list(): Promise<ChecklistView> {
    return this.checklist.list();
  }

  @Post(':key/complete')
  complete(@Param('key') key: string): Promise<ChecklistView> {
    return this.checklist.markStatus(key, 'complete');
  }

  @Post(':key/dismiss')
  dismiss(@Param('key') key: string): Promise<ChecklistView> {
    return this.checklist.markStatus(key, 'dismissed');
  }

  @Post(':key/reset')
  reset(@Param('key') key: string): Promise<ChecklistView> {
    return this.checklist.markStatus(key, 'pending');
  }
}
