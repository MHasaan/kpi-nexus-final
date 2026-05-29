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
import { KpiBenchmarksService, type PublicKpiBenchmark } from './kpi-benchmarks.service.js';
import {
  ComputeBenchmarkDtoSchema,
  CreateBenchmarkDtoSchema,
} from './dto/benchmark.dto.js';

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

@Controller('kpis/:kpiId/benchmarks')
export class KpiBenchmarksController {
  constructor(private readonly benchmarks: KpiBenchmarksService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Param('kpiId') kpiId: string): Promise<PublicKpiBenchmark[]> {
    return this.benchmarks.list(kpiId);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.CREATED)
  create(@Param('kpiId') kpiId: string, @Body() body: unknown): Promise<PublicKpiBenchmark> {
    return this.benchmarks.create(kpiId, parse(CreateBenchmarkDtoSchema, body));
  }

  @Post('compute')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.CREATED)
  compute(@Param('kpiId') kpiId: string, @Body() body: unknown): Promise<PublicKpiBenchmark> {
    return this.benchmarks.compute(kpiId, parse(ComputeBenchmarkDtoSchema, body ?? {}));
  }

  @Delete(':benchmarkId')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('benchmarkId') benchmarkId: string): Promise<void> {
    return this.benchmarks.remove(benchmarkId);
  }
}
