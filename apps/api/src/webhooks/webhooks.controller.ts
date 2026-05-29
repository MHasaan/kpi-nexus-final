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
import { WebhooksService, type PublicWebhook } from './webhooks.service.js';

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

const CreateWebhookDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    url: z.string().url().max(2000),
    events: z.array(z.string().min(1)).min(1).max(50),
  })
  .strict();

const UpdateWebhookDtoSchema = z.object({ isActive: z.boolean() }).strict();

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  list(): Promise<PublicWebhook[]> {
    return this.webhooks.list();
  }

  @Post()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<{ webhook: PublicWebhook; secret: string }> {
    return this.webhooks.create(parse(CreateWebhookDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicWebhook> {
    const { isActive } = parse(UpdateWebhookDtoSchema, body);
    return this.webhooks.setActive(id, isActive);
  }

  @Post(':id/rotate-secret')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  rotateSecret(@Param('id') id: string): Promise<{ webhook: PublicWebhook; secret: string }> {
    return this.webhooks.rotateSecret(id);
  }

  @Post(':id/test')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.ACCEPTED)
  async test(@Param('id') id: string): Promise<{ queued: boolean }> {
    await this.webhooks.test(id);
    return { queued: true };
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.webhooks.remove(id);
  }
}
