import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { IngestDtoSchema } from './dto/ingest.dto.js';
import { type IngestResult, IngestService } from './ingest.service.js';

/**
 * Bulk data-point ingest for API keys + integrations. Gated by KPI_DATA_ENTRY:
 * an API key minted with only that scope can POST here but is refused (403) on
 * KPI_CREATE endpoints — the guard enforces scopes for api-key principals.
 */
@Controller('ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post()
  @RequirePermissions(PermissionKey.KPI_DATA_ENTRY)
  @HttpCode(HttpStatus.OK)
  async run(@Body() body: unknown): Promise<IngestResult> {
    const parsed = IngestDtoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid ingest payload', details: { issues: parsed.error.issues } });
    }
    return this.ingest.ingest(parsed.data);
  }
}
