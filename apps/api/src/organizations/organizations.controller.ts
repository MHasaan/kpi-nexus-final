import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { ZodTypeAny, infer as ZInfer } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { UpdateOrganizationDtoSchema } from './dto/update-organization.dto.js';
import { OrganizationsService } from './organizations.service.js';

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

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  /** Current user's organization — full settings shape. */
  @Get('me')
  getMine(): Promise<unknown> {
    return this.orgs.getMine();
  }

  /** Just the 8 customizable labels — used by the FE terminology cache. */
  @Get('me/terminology')
  getTerminology(): ReturnType<OrganizationsService['getTerminology']> {
    return this.orgs.getTerminology();
  }

  @Patch('me')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  updateMine(@Body() body: unknown): Promise<unknown> {
    const dto = parse(UpdateOrganizationDtoSchema, body);
    return this.orgs.updateMine(dto);
  }
}
