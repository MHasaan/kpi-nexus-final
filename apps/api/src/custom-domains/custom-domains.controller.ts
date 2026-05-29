import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { CustomDomainsService, type PublicCustomDomain } from './custom-domains.service.js';

const RegisterSchema = z.object({ domain: z.string().trim().min(3).max(253) }).strict();

@Controller('custom-domains')
export class CustomDomainsController {
  constructor(private readonly svc: CustomDomainsService) {}

  @Get()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  list(): Promise<PublicCustomDomain[]> {
    return this.svc.list();
  }

  @Post()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: unknown): Promise<PublicCustomDomain> {
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'domain is required', details: { issues: parsed.error.issues } });
    }
    return this.svc.register(parsed.data.domain);
  }

  @Post(':id/verify')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.OK)
  verify(@Param('id') id: string): Promise<PublicCustomDomain> {
    return this.svc.verify(id);
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.svc.remove(id);
  }
}
