import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type PublicSsoConfig, SsoConfigService } from './sso-config.service.js';

const UpsertConfigDtoSchema = z
  .object({
    protocol: z.enum(['SAML', 'OIDC']),
    idpEntityId: z.string().trim().max(500).optional(),
    idpSsoUrl: z.string().trim().url().max(1000).optional(),
    idpMetadataUrl: z.string().trim().url().max(1000).optional(),
    allowJitProvisioning: z.boolean().optional(),
    defaultRoleId: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

@Controller('sso')
export class SsoController {
  constructor(private readonly config: SsoConfigService) {}

  @Get('config')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  get(): Promise<PublicSsoConfig | null> {
    return this.config.get();
  }

  @Put('config')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  upsert(@Body() body: unknown): Promise<PublicSsoConfig> {
    const parsed = UpsertConfigDtoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid SSO config', details: { issues: parsed.error.issues } });
    }
    return this.config.upsert(parsed.data);
  }
}
