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
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type ConnectorRunResult, ConnectorsService, type PublicConnector } from './connectors.service.js';
import { CreateConnectorDtoSchema, UpdateConnectorDtoSchema } from './dto/connector.dto.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: { issues: result.error.issues } });
  }
  return result.data;
};

@Controller('connectors')
@RequirePermissions(PermissionKey.ORG_SETTINGS)
export class ConnectorsController {
  constructor(private readonly connectors: ConnectorsService) {}

  @Get()
  list(): Promise<PublicConnector[]> {
    return this.connectors.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<PublicConnector> {
    return this.connectors.getById(id);
  }

  @Get(':id/runs')
  runs(@Param('id') id: string): Promise<unknown[]> {
    return this.connectors.listRuns(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicConnector> {
    return this.connectors.create(parse(CreateConnectorDtoSchema, body));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicConnector> {
    return this.connectors.update(id, parse(UpdateConnectorDtoSchema, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.connectors.remove(id);
  }

  @Post(':id/run')
  @HttpCode(HttpStatus.OK)
  run(@Param('id') id: string): Promise<ConnectorRunResult & { jobId: string }> {
    return this.connectors.runNow(id);
  }
}
