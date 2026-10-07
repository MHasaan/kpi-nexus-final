import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const SCIM_TOKEN_PREFIX = 'scim_';

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

const tokenSelect = {
  id: true,
  organizationId: true,
  label: true,
  expiresAt: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.ScimTokenSelect;

export type PublicScimToken = Prisma.ScimTokenGetPayload<{ select: typeof tokenSelect }>;

@Injectable()
export class ScimTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PublicScimToken[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.scimToken.findMany({ where: { organizationId: ctx.organizationId }, select: tokenSelect, orderBy: [{ createdAt: 'desc' }] });
  }

  async mint(label: string, expiresAt?: Date): Promise<{ token: string; id: string }> {
    const ctx = RequestContextStore.require();
    const token = `${SCIM_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.scimToken.create({
      data: { organizationId: ctx.organizationId, label, hashedToken: hashToken(token), expiresAt, createdById: ctx.userId },
      select: { id: true },
    });
    await this.audit.record({ action: 'CREATE', entityType: 'ScimToken', entityId: row.id, metadata: { label } });
    return { token, id: row.id };
  }

  async revoke(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.prisma.scimToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record({ action: 'UPDATE', entityType: 'ScimToken', entityId: id, metadata: { revoked: true } });
    void ctx;
  }

  /** Resolve a bearer token to an org id; null if unknown/revoked/expired. */
  async verifyAndResolve(token: string): Promise<string | null> {
    if (!token.startsWith(SCIM_TOKEN_PREFIX)) return null;
    // Cross-tenant by nature (the token IS how we learn the tenant): explicit
    // RLS bypass (OT-014).
    return RequestContextStore.runWithBypass('scim-token-verify', async () => {
      const row = await this.prisma.scimToken.findFirst({
        where: { hashedToken: hashToken(token) },
        select: { id: true, organizationId: true, revokedAt: true, expiresAt: true },
      });
      if (!row || row.revokedAt) return null;
      if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;
      await this.prisma.scimToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
      return row.organizationId;
    });
  }
}
