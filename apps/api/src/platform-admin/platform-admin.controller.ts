import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { RequestContextStore } from '../tenancy/request-context.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { type PlatformAdminRow, PlatformAdminService } from './platform-admin.service.js';

const GrantSchema = z.object({ userId: z.string().trim().min(1) }).strict();

@Controller('platform/admins')
@UseGuards(PlatformAdminGuard)
export class PlatformAdminController {
  constructor(private readonly platformAdmin: PlatformAdminService) {}

  @Get()
  list(): Promise<PlatformAdminRow[]> {
    return this.platformAdmin.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  grant(@Body() body: unknown): Promise<{ userId: string }> {
    const parsed = GrantSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'userId is required' });
    }
    return this.platformAdmin.grant(parsed.data.userId, RequestContextStore.require().userId);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('userId') userId: string): Promise<void> {
    return this.platformAdmin.revoke(userId);
  }
}
