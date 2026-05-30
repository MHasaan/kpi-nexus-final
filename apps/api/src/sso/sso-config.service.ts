import { Injectable } from '@nestjs/common';
import type { Prisma, SsoProtocol } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const configSelect = {
  id: true,
  organizationId: true,
  protocol: true,
  idpEntityId: true,
  idpSsoUrl: true,
  idpMetadataUrl: true,
  allowJitProvisioning: true,
  defaultRoleId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SsoConfigSelect; // encryptedCertificate intentionally omitted

export type PublicSsoConfig = Prisma.SsoConfigGetPayload<{ select: typeof configSelect }>;

export interface UpsertSsoConfigInput {
  protocol: SsoProtocol;
  idpEntityId?: string;
  idpSsoUrl?: string;
  idpMetadataUrl?: string;
  allowJitProvisioning?: boolean;
  defaultRoleId?: string;
  isActive?: boolean;
}

@Injectable()
export class SsoConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<PublicSsoConfig | null> {
    const ctx = RequestContextStore.require();
    return this.prisma.ssoConfig.findUnique({ where: { organizationId: ctx.organizationId }, select: configSelect });
  }

  async upsert(input: UpsertSsoConfigInput): Promise<PublicSsoConfig> {
    const ctx = RequestContextStore.require();
    const result = await this.prisma.ssoConfig.upsert({
      where: { organizationId: ctx.organizationId },
      create: {
        organizationId: ctx.organizationId,
        protocol: input.protocol,
        idpEntityId: input.idpEntityId,
        idpSsoUrl: input.idpSsoUrl,
        idpMetadataUrl: input.idpMetadataUrl,
        allowJitProvisioning: input.allowJitProvisioning ?? true,
        defaultRoleId: input.defaultRoleId,
        isActive: input.isActive ?? false,
      },
      update: {
        protocol: input.protocol,
        idpEntityId: input.idpEntityId,
        idpSsoUrl: input.idpSsoUrl,
        idpMetadataUrl: input.idpMetadataUrl,
        allowJitProvisioning: input.allowJitProvisioning,
        defaultRoleId: input.defaultRoleId,
        isActive: input.isActive,
      },
      select: configSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'SsoConfig', entityId: result.id, metadata: { protocol: result.protocol, isActive: result.isActive } });
    return result;
  }
}
