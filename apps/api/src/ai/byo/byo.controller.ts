import { BadRequestException, Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AiProviderKeySchema, PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../../rbac/decorators/require-permissions.decorator.js';
import { ByoKeyService, type ByoStatus } from './byo-key.service.js';

const SetKeySchema = z.object({ apiKey: z.string().trim().min(8) }).strict();

/** Bring-your-own AI provider key management. Gated by ORG_SETTINGS. */
@Controller('ai/providers')
export class ByoController {
  constructor(private readonly byo: ByoKeyService) {}

  @Get('byok')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  list(): Promise<ByoStatus[]> {
    return this.byo.list();
  }

  @Post(':key/byok')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  async setKey(@Param('key') key: string, @Body() body: unknown): Promise<{ configured: true; pingOk: boolean }> {
    const k = AiProviderKeySchema.safeParse(key);
    if (!k.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Unknown provider '${key}'` });
    const parsed = SetKeySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'apiKey is required' });
    const { pingOk } = await this.byo.setKey(k.data, parsed.data.apiKey);
    return { configured: true, pingOk };
  }

  @Delete(':key/byok')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  async clearKey(@Param('key') key: string): Promise<{ cleared: true }> {
    const k = AiProviderKeySchema.safeParse(key);
    if (!k.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Unknown provider '${key}'` });
    await this.byo.clearKey(k.data);
    return { cleared: true };
  }
}
