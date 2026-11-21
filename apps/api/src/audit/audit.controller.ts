import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuditAction } from '@kpi-nexus/db';
import { z } from 'zod';
import { AUDIT_ACTIONS, PermissionKey } from '@kpi-nexus/contracts';

import { RequireAnyPermission, RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { AuditService, type PublicAuditLog } from './audit.service.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  // ADR-001: AUDIT_VIEW grants compliance read without full ORG_SETTINGS; ORG_SETTINGS kept for parity.
  @RequireAnyPermission(PermissionKey.AUDIT_VIEW, PermissionKey.ORG_SETTINGS)
  list(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<PublicAuditLog[]> {
    return this.audit.list({
      entityType,
      entityId,
      userId,
      action: parseAction(action),
      limit: limit ? Number(limit) : undefined,
      cursor,
      from: parseDay(from, 'from', 'start'),
      to: parseDay(to, 'to', 'end'),
    });
  }

  /** The filtered log as a CSV file. Needs the export key as well as a key that reads the log. */
  @Get('export')
  @RequirePermissions(PermissionKey.EXPORTS)
  @RequireAnyPermission(PermissionKey.AUDIT_VIEW, PermissionKey.ORG_SETTINGS)
  async export(
    @Res() reply: FastifyReply,
    @Query('entityType') entityType?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    const csv = await this.audit.exportCsv({
      entityType,
      userId,
      action: parseAction(action),
      from: parseDay(from, 'from', 'start'),
      to: parseDay(to, 'to', 'end'),
    });
    const buffer = Buffer.from(csv, 'utf8');
    await reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`)
      .header('Content-Length', buffer.length)
      .send(buffer);
  }
}

/**
 * A `from` / `to` query value: a day (`YYYY-MM-DD`, taken as the whole UTC day)
 * or a full ISO moment. Anything else is a 400 naming the field.
 */
const ActionSchema = z.enum(AUDIT_ACTIONS);

/** An action the log records, or a 400 naming the choices: an unknown value used to reach Prisma and come back as a 500 (F-057). */
function parseAction(value: string | undefined): AuditAction | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = ActionSchema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `action must be one of: ${AUDIT_ACTIONS.join(', ')}` });
  }
  return parsed.data;
}

function parseDay(value: string | undefined, field: string, edge: 'start' | 'end'): Date | undefined {
  if (value === undefined || value === '') return undefined;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(day ? `${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}Z` : value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `${field} must be a date (YYYY-MM-DD)` });
  }
  return date;
}
