import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { PLATFORM_BYPASS_ID, RequestContextStore } from '../tenancy/request-context.js';

export interface AuditRecordInput {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  redactedKeys?: string[];
  /**
   * Tenant/actor for flows with no request context but a known tenant (e.g.
   * pre-auth password reset). Defaults to the current RequestContext.
   */
  organizationId?: string;
  userId?: string;
}

/** The most rows one export holds. */
export const AUDIT_EXPORT_MAX_ROWS = 5000;

/** One CSV cell: quoted when needed, and made plain text when a spreadsheet would run it as a formula. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface AuditListFilters {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: AuditAction;
  limit?: number;
  cursor?: string;
  /** Only rows written at or after this moment. */
  from?: Date;
  /** Only rows written at or before this moment. */
  to?: Date;
}

export interface PublicAuditLog {
  id: string;
  action: AuditAction;
  entityType: string | null;
  entityId: string | null;
  changes: unknown;
  userId: string | null;
  userEmail: string | null;
  metadata: unknown;
  redactedKeys: string[];
  createdAt: Date;
}

const auditSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  changes: true,
  userId: true,
  userEmail: true,
  metadata: true,
  redactedKeys: true,
  createdAt: true,
} as const;

const DEFAULT_REDACTED_KEYS = [
  'password',
  'passwordHash',
  'newPassword',
  'oldPassword',
  'mfaSecret',
  'mfaPendingSecret',
  'mfaRecoveryHashes',
  'refreshToken',
  'accessToken',
  'hashedToken',
];

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an audit event. Uses the current RequestContext for tenant +
   * user identity; non-context calls (cron, scripts) should call
   * `RequestContextStore.runWithBypass()` around the record.
   */
  async record(input: AuditRecordInput): Promise<void> {
    const ctx = RequestContextStore.get();
    // runWithBypass() outside a request puts a placeholder (not a real id) on
    // the context; persisting it violates the AuditLog→Organization FK and the
    // event was silently lost. Treat it as "no tenant / no actor".
    const real = (id: string | undefined) => (id && id !== PLATFORM_BYPASS_ID ? id : undefined);
    const organizationId = input.organizationId ?? real(ctx?.organizationId);
    const userId = input.userId ?? real(ctx?.userId);
    try {
      const userEmail = userId
        ? (
            await this.prisma.user.findUnique({
              where: { id: userId },
              select: { email: true },
            })
          )?.email
        : undefined;

      const { changes, redactedKeys } = this.redact(input.changes, input.redactedKeys);

      await this.prisma.auditLog.create({
        data: {
          organizationId: organizationId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          changes: changes ? (changes as Prisma.InputJsonValue) : undefined,
          userId,
          userEmail,
          metadata: input.metadata
            ? (input.metadata as Prisma.InputJsonValue)
            : undefined,
          redactedKeys,
        },
      });
    } catch (error) {
      // Auditing should never break the calling code — log and continue.
      this.logger.error(`Failed to record audit event: ${String(error)}`);
    }
  }

  list(filters: AuditListFilters = {}): Promise<PublicAuditLog[]> {
    return this.find(filters, Math.min(filters.limit ?? 100, 500));
  }

  /** The rows of `list`, newest first; `id` breaks ties so paging by cursor never skips or repeats a row. */
  private find(filters: AuditListFilters, take: number): Promise<PublicAuditLog[]> {
    const ctx = RequestContextStore.require();
    const createdAt =
      filters.from || filters.to
        ? { ...(filters.from && { gte: filters.from }), ...(filters.to && { lte: filters.to }) }
        : undefined;
    return this.prisma.auditLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: filters.entityType,
        entityId: filters.entityId,
        userId: filters.userId,
        action: filters.action,
        createdAt,
      },
      select: auditSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(filters.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
    });
  }

  /**
   * The same rows as a CSV file, up to {@link AUDIT_EXPORT_MAX_ROWS}. Changes and
   * metadata are left out: they are nested and already redacted in the list.
   */
  async exportCsv(filters: Omit<AuditListFilters, 'limit' | 'cursor'> = {}): Promise<string> {
    const rows = await this.find(filters, AUDIT_EXPORT_MAX_ROWS);
    const lines = [
      ['Time (UTC)', 'Action', 'Entity type', 'Entity id', 'Person', 'Redacted fields'],
      ...rows.map((r) => [
        r.createdAt.toISOString(),
        r.action,
        r.entityType ?? '',
        r.entityId ?? '',
        r.userEmail ?? r.userId ?? '',
        r.redactedKeys.join(' '),
      ]),
    ];
    return lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  /** Strip sensitive keys (and any caller-supplied extras) from a change object. */
  private redact(
    changes: Record<string, unknown> | undefined,
    extra: string[] = [],
  ): { changes: Record<string, unknown> | undefined; redactedKeys: string[] } {
    if (!changes) return { changes: undefined, redactedKeys: [] };
    const keysToRedact = new Set([...DEFAULT_REDACTED_KEYS, ...extra]);
    const out: Record<string, unknown> = {};
    const redacted: string[] = [];
    for (const [key, value] of Object.entries(changes)) {
      if (keysToRedact.has(key)) {
        redacted.push(key);
        out[key] = '[REDACTED]';
      } else {
        out[key] = value;
      }
    }
    return { changes: out, redactedKeys: redacted };
  }
}
