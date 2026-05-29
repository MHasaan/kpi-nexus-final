import { randomBytes, createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const API_KEY_PREFIX = 'kpinx_';

const publicSelect = {
  id: true,
  organizationId: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdById: true,
} satisfies Prisma.ApiKeySelect;

export type PublicApiKey = Prisma.ApiKeyGetPayload<{ select: typeof publicSelect }>;

export interface VerifiedApiKey {
  organizationId: string;
  apiKeyId: string;
  scopes: string[];
}

/** SHA-256 hex of the plaintext key — what we store + look up by. */
function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PublicApiKey[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.apiKey.findMany({
      where: { organizationId: ctx.organizationId },
      select: publicSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /** Returns the public row PLUS the one-time plaintext key. */
  async create(input: {
    name: string;
    scopes: string[];
    expiresAt?: Date;
  }): Promise<{ apiKey: PublicApiKey; plaintext: string }> {
    const ctx = RequestContextStore.require();
    const random = randomBytes(24).toString('base64url'); // ~32 chars
    const plaintext = `${API_KEY_PREFIX}${random}`;
    const keyPrefix = random.slice(0, 12);

    const apiKey = await this.prisma.apiKey.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        hashedKey: hashKey(plaintext),
        keyPrefix,
        scopes: input.scopes,
        expiresAt: input.expiresAt,
        createdById: ctx.userId,
      },
      select: publicSelect,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'ApiKey',
      entityId: apiKey.id,
      metadata: { name: apiKey.name, scopes: apiKey.scopes },
    });
    return { apiKey, plaintext };
  }

  /**
   * Verify a plaintext key. Runs OUTSIDE request context (called from the auth
   * guard), so it queries by the globally-unique hashedKey directly. Returns
   * null when the key is unknown, revoked, or expired.
   */
  async verify(plaintext: string): Promise<VerifiedApiKey | null> {
    if (!plaintext.startsWith(API_KEY_PREFIX)) return null;
    const row = await this.prisma.apiKey.findUnique({
      where: { hashedKey: hashKey(plaintext) },
      select: { id: true, organizationId: true, scopes: true, revokedAt: true, expiresAt: true },
    });
    if (!row) return null;
    if (row.revokedAt !== null) return null;
    if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) return null;

    // Best-effort lastUsedAt bump; never blocks auth.
    void this.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return { organizationId: row.organizationId, apiKeyId: row.id, scopes: row.scopes };
  }

  async revoke(id: string): Promise<PublicApiKey> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'API key not found' });
    }
    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: publicSelect,
    });
    await this.audit.record({ action: 'DELETE', entityType: 'ApiKey', entityId: id });
    return updated;
  }
}
