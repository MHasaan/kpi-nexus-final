import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type PublicRetentionPolicy, type RetentionPreviewRow, RetentionService } from './retention.service.js';
import type { RetentionTier } from './retention-tiers.js';
import { ApiBody } from '../openapi/api-body.decorator.js';

const ApplyTierDtoSchema = z.object({ tier: z.enum(['FREE', 'PRO', 'ENTERPRISE']) }).strict();
/** `days`: how long to keep the rows. `purging`: turn the daily purge on or off for this policy. One or both. */
const UpdatePolicyDtoSchema = z
  .object({ days: z.number().int().min(1).max(36500).optional(), purging: z.boolean().optional() })
  .strict()
  .refine((v) => v.days !== undefined || v.purging !== undefined, { message: 'days or purging is required' });
const RunDtoSchema = z.object({ dryRun: z.boolean() }).strict();

@Controller('retention-policies')
@RequirePermissions(PermissionKey.ORG_SETTINGS)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get()
  list(): Promise<PublicRetentionPolicy[]> {
    return this.retention.list();
  }

  @Get('tiers/list')
  tiers(): Array<{ tier: RetentionTier; days: number }> {
    return this.retention.listTiers();
  }

  @Post('apply-tier')
  @HttpCode(HttpStatus.OK)
  @ApiBody(ApplyTierDtoSchema)
  applyTier(@Body() body: unknown): Promise<PublicRetentionPolicy[]> {
    const parsed = ApplyTierDtoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'tier must be FREE|PRO|ENTERPRISE' });
    return this.retention.applyTier(parsed.data.tier);
  }

  /**
   * Set a policy's days and/or turn its purging on or off. Changing the days
   * turns purging off, so `{days, purging: true}` in one call sets the period
   * and then turns purging on for it.
   */
  @Put(':entityType')
  @ApiBody(UpdatePolicyDtoSchema)
  async update(@Param('entityType') entityType: string, @Body() body: unknown): Promise<PublicRetentionPolicy[]> {
    const parsed = UpdatePolicyDtoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'days must be a whole number from 1 to 36500; purging must be true or false', details: parsed.error.flatten() });
    }
    let policies = parsed.data.days !== undefined ? await this.retention.setDays(entityType, parsed.data.days) : undefined;
    if (parsed.data.purging !== undefined) policies = await this.retention.setPurging(entityType, parsed.data.purging);
    return policies ?? this.retention.list();
  }

  /**
   * `dryRun: true` counts what each policy would delete and deletes nothing.
   * `dryRun: false` runs the purge now, for the policies that are turned on.
   */
  @Post('run')
  @HttpCode(HttpStatus.OK)
  @ApiBody(RunDtoSchema)
  async run(@Body() body: unknown): Promise<{ preview: RetentionPreviewRow[] } | { policies: number; deleted: number }> {
    const parsed = RunDtoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'dryRun must be true or false' });
    if (parsed.data.dryRun) return { preview: await this.retention.preview() };
    return this.retention.purgeOrganization();
  }
}
