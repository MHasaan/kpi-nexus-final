import { randomBytes } from 'node:crypto';

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  /**
   * Connect a provider, storing what that provider needs:
   *
   *  - `slack`: the workspace (team) id. It is how a `/kpi` command or a button
   *    press from Slack is matched to this organisation, so a workspace another
   *    organisation has connected cannot be claimed.
   *  - `jira`: a webhook secret is made here and returned once, to paste into
   *    Jira with the connection's webhook address.
   *
   * Either way the connection starts PENDING and becomes CONNECTED when the
   * provider is first heard from. Any other provider name is refused — it used
   * to be stored, with no credentials, as "connected".
   */
  async connect(input: { provider: string; teamId?: string }): Promise<{ connection: PublicIntegrationConnection; webhookSecret?: string }> {
    const ctx = RequestContextStore.require();
    if (input.provider !== 'slack' && input.provider !== 'jira') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `'${input.provider}' cannot be connected here` });
    }
    const already = await this.prisma.integrationConnection.findFirst({
      where: { organizationId: ctx.organizationId, provider: input.provider },
      select: { id: true },
    });
    if (already) {
      throw new ConflictException({ code: 'CONFLICT', message: 'This is already connected. Disconnect it first to connect it again.' });
    }

    if (input.provider === 'slack') {
      const teamId = input.teamId?.trim() ?? '';
      if (!/^T[A-Z0-9]{2,20}$/.test(teamId)) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'The Slack workspace ID starts with T, for example T0ABC123' });
      }
      // Cross-tenant on purpose: a workspace maps to exactly one organisation.
      const claimed = await RequestContextStore.runWithBypass('slack-team-claim', () =>
        this.prisma.integrationConnection.findFirst({
          where: { provider: 'slack', metadata: { path: ['team_id'], equals: teamId } },
          select: { id: true },
        }),
      );
      if (claimed) {
        throw new ConflictException({ code: 'CONFLICT', message: 'That Slack workspace is already connected to an organisation' });
      }
      const connection = await this.create({ provider: 'slack', displayName: 'Slack', tokens: {}, metadata: { team_id: teamId }, status: 'PENDING' });
      return { connection };
    }

    const webhookSecret = randomBytes(32).toString('base64url');
    const connection = await this.create({ provider: 'jira', displayName: 'Jira', tokens: { webhookSecret }, status: 'PENDING' });
    return { connection, webhookSecret };
  }

  /** Replace a Jira connection's webhook secret. The old one stops working at once; the new one is returned once. */
  async rotateWebhookSecret(id: string): Promise<{ webhookSecret: string }> {
    const connection = await this.getById(id);
    if (connection.provider !== 'jira') {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Only a Jira connection has a webhook secret' });
    }
    const webhookSecret = randomBytes(32).toString('base64url');
    await this.rotateTokens(id, { webhookSecret });
    return { webhookSecret };
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
