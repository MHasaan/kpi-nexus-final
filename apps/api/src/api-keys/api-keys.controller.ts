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
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { ApiKeysService, type PublicApiKey } from './api-keys.service.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

const CreateApiKeyDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    scopes: z.array(z.nativeEnum(PermissionKey)).min(1).max(18),
    expiresAt: z.string().datetime().transform((s) => new Date(s)).optional(),
  })
  .strict();

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  list(): Promise<PublicApiKey[]> {
    return this.apiKeys.list();
  }

  @Post()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: unknown,
  ): Promise<{ apiKey: PublicApiKey; plaintext: string }> {
    const dto = parse(CreateApiKeyDtoSchema, body);
    return this.apiKeys.create(dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  revoke(@Param('id') id: string): Promise<PublicApiKey> {
    return this.apiKeys.revoke(id);
  }
}
