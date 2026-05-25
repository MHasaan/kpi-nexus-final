import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction, Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

export interface AuditRecordInput {
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  redactedKeys?: string[];
}

export interface AuditListFilters {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: AuditAction;
  limit?: number;
  cursor?: string;
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
    try {
      const userEmail = ctx?.userId
        ? (
            await this.prisma.user.findUnique({
              where: { id: ctx.userId },
              select: { email: true },
            })
          )?.email
        : undefined;

      const { changes, redactedKeys } = this.redact(input.changes, input.redactedKeys);

      await this.prisma.auditLog.create({
        data: {
          organizationId: ctx?.organizationId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          changes: changes ? (changes as Prisma.InputJsonValue) : undefined,
          userId: ctx?.userId,
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
    const ctx = RequestContextStore.require();
    const limit = Math.min(filters.limit ?? 100, 500);
    return this.prisma.auditLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: filters.entityType,
        entityId: filters.entityId,
        userId: filters.userId,
        action: filters.action,
      },
      select: auditSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(filters.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
    });
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
