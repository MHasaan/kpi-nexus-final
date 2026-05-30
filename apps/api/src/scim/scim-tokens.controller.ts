import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type PublicScimToken, ScimTokenService } from './scim-token.service.js';

const MintDtoSchema = z.object({ label: z.string().trim().min(1).max(120) }).strict();

/** Admin management of SCIM bearer tokens (the IdP-facing credential). */
@Controller('scim/tokens')
@RequirePermissions(PermissionKey.ORG_SETTINGS)
export class ScimTokensController {
  constructor(private readonly tokens: ScimTokenService) {}

  @Get()
  list(): Promise<PublicScimToken[]> {
    return this.tokens.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async mint(@Body() body: unknown): Promise<{ id: string; token: string }> {
    const parsed = MintDtoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'label is required' });
    return this.tokens.mint(parsed.data.label);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id') id: string): Promise<void> {
    return this.tokens.revoke(id);
  }
}
