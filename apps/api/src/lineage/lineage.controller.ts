import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { LineageService } from './lineage.service.js';
import type { LineageHop, LineageLevel } from './lineage-graph.js';
import { LineageDepthQuerySchema, LineageTraceQuerySchema } from './dto/lineage.dto.js';

const parse = <S extends ZodTypeAny>(schema: S, input: unknown): ZInfer<S> => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid query',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

@Controller('lineage/:type/:id')
export class LineageController {
  constructor(private readonly lineage: LineageService) {}

  @Get('upstream')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  upstream(
    @Param('type') type: string,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<LineageHop[]> {
    const { depth } = parse(LineageDepthQuerySchema, query);
    return this.lineage.getUpstream(type, id, depth);
  }

  @Get('downstream')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  downstream(
    @Param('type') type: string,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<LineageHop[]> {
    const { depth } = parse(LineageDepthQuerySchema, query);
    return this.lineage.getDownstream(type, id, depth);
  }

  @Get('trace')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  trace(
    @Param('type') type: string,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<{ upstream: LineageLevel[]; downstream: LineageLevel[] }> {
    const { maxDepth } = parse(LineageTraceQuerySchema, query);
    return this.lineage.trace(type, id, maxDepth);
  }
}
