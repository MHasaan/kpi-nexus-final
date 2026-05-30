import { Injectable, NotFoundException } from '@nestjs/common';
import type { IntegrationConnectionStatus, Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { IntegrationCryptoService } from './integration-crypto.service.js';

// `encryptedTokens` is intentionally NOT selected — it must never leave the
// service except via getDecryptedTokens (internal, provider-only).
const publicSelect = {
  id: true,
  organizationId: true,
  provider: true,
  displayName: true,
  scopes: true,
  status: true,
  lastSyncAt: true,
  lastError: true,
  metadata: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.IntegrationConnectionSelect;

export type PublicIntegrationConnection = Prisma.IntegrationConnectionGetPayload<{ select: typeof publicSelect }>;

export interface CreateConnectionInput {
  provider: string;
  displayName?: string;
  tokens: unknown;
  scopes?: string[];
  metadata?: Record<string, unknown>;
  status?: IntegrationConnectionStatus;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: IntegrationCryptoService,
  ) {}

  async list(): Promise<PublicIntegrationConnection[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.integrationConnection.findMany({
      where: { organizationId: ctx.organizationId },
      select: publicSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getById(id: string): Promise<PublicIntegrationConnection> {
    const ctx = RequestContextStore.require();
    const conn = await this.prisma.integrationConnection.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: publicSelect,
    });
    if (!conn) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Integration not found' });
    return conn;
  }

  async create(input: CreateConnectionInput): Promise<PublicIntegrationConnection> {
    const ctx = RequestContextStore.require();
    const created = await this.prisma.integrationConnection.create({
      data: {
        organizationId: ctx.organizationId,
        provider: input.provider,
        displayName: input.displayName,
        encryptedTokens: this.crypto.encrypt(input.tokens) as unknown as Prisma.InputJsonValue,
        scopes: input.scopes ?? [],
        status: input.status ?? 'CONNECTED',
        metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        createdById: ctx.userId,
      },
      select: publicSelect,
    });
    // Audit carries provider + scopes only — never the token blob.
    await this.audit.record({
      action: 'CREATE',
      entityType: 'IntegrationConnection',
      entityId: created.id,
      metadata: { provider: created.provider, scopes: created.scopes },
    });
    return created;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.integrationConnection.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'IntegrationConnection', entityId: id });
  }

  async updateStatus(id: string, status: IntegrationConnectionStatus, error?: string): Promise<void> {
    await this.getById(id);
    await this.prisma.integrationConnection.update({
      where: { id },
      data: { status, lastError: error ?? null, lastSyncAt: new Date() },
    });
  }

  async rotateTokens(id: string, newTokens: unknown): Promise<void> {
    await this.getById(id);
    await this.prisma.integrationConnection.update({
      where: { id },
      data: { encryptedTokens: this.crypto.encrypt(newTokens) as unknown as Prisma.InputJsonValue },
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'IntegrationConnection', entityId: id, metadata: { rotated: true } });
  }

  /** Internal — used by provider modules (Slack/Jira). Never exposed via API. */
  async getDecryptedTokens<T = Record<string, unknown>>(id: string): Promise<T> {
    const ctx = RequestContextStore.require();
    const conn = await this.prisma.integrationConnection.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { encryptedTokens: true },
    });
    if (!conn) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Integration not found' });
    return this.crypto.decrypt<T>(conn.encryptedTokens as unknown as string);
  }
}
