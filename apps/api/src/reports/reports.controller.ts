import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { ZodTypeAny, infer as ZInfer } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { BoardPackQuerySchema, GenerateReportDtoSchema } from './dto/reports.dto.js';
import { EmbedTokenService } from './services/embed-token.service.js';
import { BoardPackService } from './services/board-pack.service.js';
import { ReportsService } from './reports.service.js';

const parse = <S extends ZodTypeAny>(schema: S, data: unknown): ZInfer<S> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

/**
 * Authenticated report endpoints.
 * POST /reports/generate         — on-demand report (CSV/Excel/PDF), streams binary.
 * GET  /reports/board-pack       — JSON board-pack summary.
 * POST /reports/kpis/:id/embed-token — mint a public embed token for a KPI.
 */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly boardPack: BoardPackService,
    private readonly embedTokens: EmbedTokenService,
  ) {}

  /**
   * POST /reports/generate
   *
   * Body: { format: 'CSV'|'EXCEL'|'PDF', dashboardId?, kpiIds?, from?, to? }
   * Streams the generated file as an attachment.
   */
  @Post('generate')
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  @HttpCode(HttpStatus.OK)
  async generate(
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const dto = parse(GenerateReportDtoSchema, body);
    const { buffer, filename, contentType } = await this.reports.generate(dto);

    await reply
      .header('Content-Type', contentType)
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Content-Length', buffer.length)
      .send(buffer);
  }

  /**
   * GET /reports/board-pack?sinceDays=N
   *
   * Returns a JSON board-pack summary for the last N days (default 30).
   */
  @Get('board-pack')
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  async getBoardPack(@Query() query: unknown) {
    const { sinceDays } = parse(BoardPackQuerySchema, query);
    return this.boardPack.compose({ sinceDays });
  }

  /**
   * POST /reports/kpis/:id/embed-token
   *
   * Mint a stateless HMAC embed token for a KPI (valid 30 days).
   * Requires KPI_VIEW — the caller must be authorised to view the KPI.
   * Returns { token }.
   */
  @Post('kpis/:id/embed-token')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @HttpCode(HttpStatus.CREATED)
  mintEmbedToken(@Param('id') id: string): { token: string } {
    return { token: this.embedTokens.mint(id) };
  }
}
