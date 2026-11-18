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
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequireAnyPermission } from '../rbac/decorators/require-permissions.decorator.js';
import { CreateIntegrationDtoSchema } from './dto/integration.dto.js';
import { IntegrationsService, type PublicIntegrationConnection } from './integrations.service.js';
import { ApiBody } from '../openapi/api-body.decorator.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

@Controller('integrations')
// ADR-001: manageable via INTEGRATIONS_MANAGE; ORG_SETTINGS kept for parity.
@RequireAnyPermission(PermissionKey.INTEGRATIONS_MANAGE, PermissionKey.ORG_SETTINGS)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list(): Promise<PublicIntegrationConnection[]> {
    return this.integrations.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<PublicIntegrationConnection> {
    return this.integrations.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody(CreateIntegrationDtoSchema)
  create(@Body() body: unknown): Promise<{ connection: PublicIntegrationConnection; webhookSecret?: string }> {
    return this.integrations.connect(parse(CreateIntegrationDtoSchema, body));
  }

  /** Jira: replace the webhook secret. The new one is in the response, once. */
  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  rotateSecret(@Param('id') id: string): Promise<{ webhookSecret: string }> {
    return this.integrations.rotateWebhookSecret(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.integrations.remove(id);
  }
}
