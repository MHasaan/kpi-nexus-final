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
import { CreateWorkflowDtoSchema, UpdateWorkflowDtoSchema } from './dto/workflow.dto.js';
import { type PublicWorkflow, WorkflowsService } from './workflows.service.js';

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

@Controller('workflows')
@RequirePermissions(PermissionKey.ORG_SETTINGS)
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list(): Promise<PublicWorkflow[]> {
    return this.workflows.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<PublicWorkflow> {
    return this.workflows.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicWorkflow> {
    return this.workflows.create(parse(CreateWorkflowDtoSchema, body));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicWorkflow> {
    return this.workflows.update(id, parse(UpdateWorkflowDtoSchema, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.workflows.remove(id);
  }

  @Post(':id/trigger')
  @HttpCode(HttpStatus.OK)
  async trigger(@Param('id') id: string): Promise<{ ok: true }> {
    await this.workflows.trigger(id, { kind: 'kpi_changed', kpiId: 'manual', value: 0 });
    return { ok: true };
  }
}
