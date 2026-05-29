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
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type MyKpiRow, UserKpisService } from './user-kpis.service.js';
import { AssignUserKpiDtoSchema } from './dto/user-kpi.dto.js';

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

@Controller('user-kpis')
export class UserKpisController {
  constructor(private readonly userKpis: UserKpisService) {}

  /** The caller's own PER_USER KPIs (data-recording endpoint lives in KpiDataController). */
  @Get('my-kpis')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  myKpis(): Promise<MyKpiRow[]> {
    return this.userKpis.listMyKpis();
  }

  /** Direct reports' PER_USER KPIs (manager view). */
  @Get('team')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  team(): Promise<Array<{ userId: string; fullName: string; kpis: MyKpiRow[] }>> {
    return this.userKpis.listTeam();
  }

  /** A specific user's PER_USER KPIs (admin/manager view). */
  @Get('user/:userId')
  @RequirePermissions(PermissionKey.USERS_VIEW)
  forUser(@Param('userId') userId: string): Promise<MyKpiRow[]> {
    return this.userKpis.listForUser(userId);
  }

  @Post('assign')
  @RequirePermissions(PermissionKey.KPI_CREATE, PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  assign(@Body() body: unknown): Promise<{ id: string }> {
    return this.userKpis.assign(parse(AssignUserKpiDtoSchema, body));
  }

  @Delete('assignments/:id')
  @RequirePermissions(PermissionKey.KPI_CREATE, PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(@Param('id') id: string): Promise<void> {
    return this.userKpis.unassign(id);
  }
}
