import { resolveTxt } from 'node:dns/promises';

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { buildChallenge, normalizeDomain } from './domain-challenge.js';

const select = {
  id: true,
  organizationId: true,
  domain: true,
  txtChallengeKey: true,
  txtChallengeValue: true,
  verifiedAt: true,
  lastCheckedAt: true,
  lastCheckError: true,
  createdAt: true,
} satisfies Prisma.CustomDomainSelect;

export type PublicCustomDomain = Prisma.CustomDomainGetPayload<{ select: typeof select }>;

@Injectable()
export class CustomDomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<PublicCustomDomain[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.customDomain.findMany({
      where: { organizationId: ctx.organizationId },
      select,
      orderBy: { createdAt: 'asc' },
    });
  }

  async register(domainInput: string): Promise<PublicCustomDomain> {
    const ctx = RequestContextStore.require();
    const domain = normalizeDomain(domainInput);
    const challenge = buildChallenge(domain, ctx.organizationId);
    try {
      const created = await this.prisma.customDomain.create({
        data: {
          organizationId: ctx.organizationId,
          domain,
          txtChallengeKey: challenge.key,
          txtChallengeValue: challenge.value,
        },
        select,
      });
      await this.audit.record({ action: 'CREATE', entityType: 'CustomDomain', entityId: created.id, metadata: { domain } });
      return created;
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
        throw new ConflictException({ code: 'CONFLICT', message: 'This domain is already registered' });
      }
      throw err;
    }
  }

  /**
   * Check the DNS TXT record. On match, stamps verifiedAt; otherwise records the
   * error. Never throws on DNS failure — a missing record is the expected
   * unverified state.
   */
  async verify(id: string): Promise<PublicCustomDomain> {
    const row = await this.require(id);
    const now = new Date();
    let verifiedAt: Date | null = row.verifiedAt;
    let lastCheckError: string | null = null;
    try {
      const records = await resolveTxt(row.txtChallengeKey);
      const flattened = records.map((chunks) => chunks.join(''));
      if (flattened.includes(row.txtChallengeValue)) {
        verifiedAt = now;
      } else {
        lastCheckError = 'TXT record found but value did not match';
      }
    } catch (err) {
      lastCheckError = `DNS lookup failed: ${(err as Error).message}`;
    }
    const updated = await this.prisma.customDomain.update({
      where: { id },
      data: { verifiedAt, lastCheckedAt: now, lastCheckError },
      select,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'CustomDomain', entityId: id, metadata: { verified: verifiedAt !== null } });
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.prisma.customDomain.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'CustomDomain', entityId: id });
  }

  private async require(id: string): Promise<PublicCustomDomain> {
    const ctx = RequestContextStore.require();
    const row = await this.prisma.customDomain.findFirst({ where: { id, organizationId: ctx.organizationId }, select });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Custom domain not found' });
    return row;
  }
}
