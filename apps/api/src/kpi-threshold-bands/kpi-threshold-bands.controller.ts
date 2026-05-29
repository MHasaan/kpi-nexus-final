import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import {
  KpiThresholdBandsService,
  type PublicThresholdBand,
} from './kpi-threshold-bands.service.js';
import type { ResolvedStatus } from './threshold-resolver.js';
import {
  CreateThresholdBandDtoSchema,
  UpdateThresholdBandDtoSchema,
} from './dto/threshold-band.dto.js';

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

@Controller('kpis/:kpiId/threshold-bands')
export class KpiThresholdBandsController {
  constructor(private readonly bands: KpiThresholdBandsService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Param('kpiId') kpiId: string): Promise<PublicThresholdBand[]> {
    return this.bands.list(kpiId);
  }

  @Get('status')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  status(@Param('kpiId') kpiId: string): Promise<ResolvedStatus> {
    return this.bands.resolveStatus(kpiId);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.CREATED)
  create(@Param('kpiId') kpiId: string, @Body() body: unknown): Promise<PublicThresholdBand> {
    return this.bands.create(kpiId, parse(CreateThresholdBandDtoSchema, body));
  }

  @Patch(':bandId')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  update(@Param('bandId') bandId: string, @Body() body: unknown): Promise<PublicThresholdBand> {
    return this.bands.update(bandId, parse(UpdateThresholdBandDtoSchema, body));
  }

  @Delete(':bandId')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('bandId') bandId: string): Promise<void> {
    return this.bands.remove(bandId);
  }
}
