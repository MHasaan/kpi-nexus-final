import { Controller, Get, Param } from '@nestjs/common';

import { Public } from '../rbac/decorators/public.decorator.js';
import { type EmbedKpiSnapshot, EmbedTokenService } from './services/embed-token.service.js';

/**
 * Public (unauthenticated) endpoint for resolving KPI embed tokens.
 * Mounted at `/public/embed` — separate from the auth-gated `ReportsController`
 * so `@Public()` stays off the main controller path.
 *
 * GET /public/embed/kpi/:token
 *   200 — KPI snapshot (latestValue, sparkline, thresholdStatus)
 *   401 — tampered/invalid token
 *   410 — expired token
 *   404 — KPI no longer exists
 */
@Controller('public/embed')
export class PublicEmbedController {
  constructor(private readonly embedTokens: EmbedTokenService) {}

  @Get('kpi/:token')
  @Public()
  resolveEmbed(@Param('token') token: string): Promise<EmbedKpiSnapshot> {
    return this.embedTokens.resolve(token);
  }
}
