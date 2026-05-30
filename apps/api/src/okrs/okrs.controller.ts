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
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import {
  CreateKeyResultDtoSchema,
  CreateObjectiveDtoSchema,
  ListObjectivesQuerySchema,
  UpdateKeyResultDtoSchema,
  UpdateObjectiveDtoSchema,
} from './dto/okr.dto.js';
import { KeyResultsService, type PublicKeyResult } from './key-results.service.js';
import { ObjectivesService, type PublicObjective } from './objectives.service.js';

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

@Controller('objectives')
export class OkrsController {
  constructor(
    private readonly objectives: ObjectivesService,
    private readonly keyResults: KeyResultsService,
  ) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Query() query: unknown): Promise<PublicObjective[]> {
    return this.objectives.list(parse(ListObjectivesQuerySchema, query ?? {}));
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  getById(@Param('id') id: string): Promise<PublicObjective> {
    return this.objectives.getById(id);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicObjective> {
    return this.objectives.create(parse(CreateObjectiveDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicObjective> {
    return this.objectives.update(id, parse(UpdateObjectiveDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.KPI_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.objectives.remove(id);
  }

  @Post(':id/sync-from-linked-kpis')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.OK)
  sync(@Param('id') id: string): Promise<PublicObjective> {
    return this.objectives.syncFromLinkedKpis(id);
  }

  // --- Key results (nested under an objective) ---

  @Get(':id/key-results')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  listKeyResults(@Param('id') id: string): Promise<PublicKeyResult[]> {
    return this.keyResults.list(id);
  }

  @Post(':id/key-results')
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.CREATED)
  createKeyResult(@Param('id') id: string, @Body() body: unknown): Promise<PublicKeyResult> {
    return this.keyResults.create(id, parse(CreateKeyResultDtoSchema, body));
  }

  @Patch(':id/key-results/:krId')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  updateKeyResult(@Param('krId') krId: string, @Body() body: unknown): Promise<PublicKeyResult> {
    return this.keyResults.update(krId, parse(UpdateKeyResultDtoSchema, body));
  }

  @Delete(':id/key-results/:krId')
  @RequirePermissions(PermissionKey.KPI_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeKeyResult(@Param('krId') krId: string): Promise<void> {
    return this.keyResults.remove(krId);
  }
}
