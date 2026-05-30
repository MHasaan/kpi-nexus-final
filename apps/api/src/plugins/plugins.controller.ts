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
  Query,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { PluginType } from '@kpi-nexus/db';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { InstallPluginDtoSchema, PluginTypeSchema, SetEnabledDtoSchema } from './dto/plugin.dto.js';
import { PluginsService, type PublicPlugin } from './plugins.service.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: { issues: result.error.issues } });
  }
  return result.data;
};

@Controller('plugins')
@RequirePermissions(PermissionKey.ORG_SETTINGS)
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  list(@Query('type') type?: string): Promise<PublicPlugin[]> {
    const parsedType = type ? PluginTypeSchema.safeParse(type) : null;
    return this.plugins.list(parsedType?.success ? (parsedType.data as PluginType) : undefined);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<PublicPlugin> {
    return this.plugins.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  install(@Body() body: unknown): Promise<PublicPlugin> {
    return this.plugins.install(parse(InstallPluginDtoSchema, body));
  }

  @Patch(':id')
  setEnabled(@Param('id') id: string, @Body() body: unknown): Promise<PublicPlugin> {
    return this.plugins.setEnabled(id, parse(SetEnabledDtoSchema, body).isEnabled);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.plugins.remove(id);
  }
}
