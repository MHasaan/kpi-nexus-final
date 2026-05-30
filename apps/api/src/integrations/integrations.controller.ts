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

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { CreateIntegrationDtoSchema } from './dto/integration.dto.js';
import { IntegrationsService, type PublicIntegrationConnection } from './integrations.service.js';

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
@RequirePermissions(PermissionKey.ORG_SETTINGS)
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
  create(@Body() body: unknown): Promise<PublicIntegrationConnection> {
    return this.integrations.create(parse(CreateIntegrationDtoSchema, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.integrations.remove(id);
  }
}
