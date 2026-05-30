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
  CreateTaskDtoSchema,
  ListTasksQuerySchema,
  UpdateTaskDtoSchema,
} from './dto/task.dto.js';
import { type PublicTask, TasksService } from './tasks.service.js';

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

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  // Task read/write is entity-bound + permission-gated inside the service; the
  // endpoints require KPI_VIEW as the baseline "can use the app" gate.
  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Query() query: unknown): Promise<PublicTask[]> {
    return this.tasks.list(parse(ListTasksQuerySchema, query ?? {}));
  }

  @Get('my-tasks')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  myTasks(): Promise<PublicTask[]> {
    return this.tasks.myTasks();
  }

  @Get('by-kpi/:kpiId')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  byKpi(@Param('kpiId') kpiId: string): Promise<PublicTask[]> {
    return this.tasks.byKpi(kpiId);
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  getById(@Param('id') id: string): Promise<PublicTask> {
    return this.tasks.getById(id);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicTask> {
    return this.tasks.create(parse(CreateTaskDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicTask> {
    return this.tasks.update(id, parse(UpdateTaskDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.tasks.remove(id);
  }
}
