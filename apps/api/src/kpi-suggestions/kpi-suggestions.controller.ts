import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { KpiSuggestionsService } from './kpi-suggestions.service.js';
import type { KpiSuggestion } from './kpi-suggestion-parser.js';

const SuggestSchema = z
  .object({
    count: z.number().int().min(1).max(10).optional(),
    focus: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

@Controller('ai')
export class KpiSuggestionsController {
  constructor(private readonly suggestions: KpiSuggestionsService) {}

  @Post('suggest-kpis')
  @RequirePermissions(PermissionKey.KPI_CREATE)
  async suggest(@Body() body: unknown): Promise<{ suggestions: KpiSuggestion[] }> {
    const parsed = SuggestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid suggest-kpis request', details: parsed.error.flatten() });
    }
    return { suggestions: await this.suggestions.suggest(parsed.data) };
  }
}
