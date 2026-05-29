import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { NotificationChannelsService, type PublicChannel } from './notification-channels.service.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

const ChannelKind = z.enum(['EMAIL', 'SLACK', 'TEAMS', 'SMS', 'IN_APP', 'WEBHOOK']);

const CreateChannelDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    kind: ChannelKind,
    config: z.record(z.unknown()).default({}),
  })
  .strict();

const UpdateChannelDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    isActive: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .strict();

@Controller('notification-channels')
export class NotificationChannelsController {
  constructor(private readonly channels: NotificationChannelsService) {}

  @Get()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  list(): Promise<PublicChannel[]> {
    return this.channels.list();
  }

  @Post()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicChannel> {
    return this.channels.create(parse(CreateChannelDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicChannel> {
    return this.channels.update(id, parse(UpdateChannelDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.channels.remove(id);
  }

  @Post(':id/test')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.ACCEPTED)
  async test(@Param('id') id: string): Promise<{ sent: boolean }> {
    await this.channels.test(id);
    return { sent: true };
  }
}
