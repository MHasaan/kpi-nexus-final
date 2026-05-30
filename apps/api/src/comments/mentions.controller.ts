import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { MentionsService, type PublicMention } from './mentions.service.js';

/** Per-user mention inbox — authenticated (any role); a user only ever sees
 * their own mentions, enforced in the service via the request context. */
@Controller('me/mentions')
export class MentionsController {
  constructor(private readonly mentions: MentionsService) {}

  @Get()
  list(
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ): Promise<PublicMention[]> {
    return this.mentions.list({
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
      limit: limit ? Math.min(200, Math.max(1, Number(limit) || 50)) : undefined,
    });
  }

  @Get('unread-count')
  async unreadCount(): Promise<{ count: number }> {
    return { count: await this.mentions.unreadCount() };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@Param('id') id: string): Promise<PublicMention> {
    return this.mentions.markRead(id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(): Promise<{ count: number }> {
    return this.mentions.markAllRead();
  }
}
