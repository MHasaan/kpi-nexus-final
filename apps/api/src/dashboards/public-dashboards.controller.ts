import { Controller, Get, Param, Query } from '@nestjs/common';

import { Public } from '../rbac/decorators/public.decorator.js';
import { type ShareLinkResolvedPayload, ShareLinksService } from './share-links.service.js';

/**
 * Public (unauthenticated) controller for resolving dashboard share tokens.
 * Mounted at `/public/dashboards` — intentionally separate from the
 * auth-gated `DashboardsController` so `@Public()` stays off the main
 * controller path.
 */
@Controller('public/dashboards')
export class PublicDashboardsController {
  constructor(private readonly shareLinks: ShareLinksService) {}

  /**
   * GET /public/dashboards/:token
   *
   * Resolve a share-link token to its read-only dashboard payload.
   * An optional `?password=` query param is accepted for password-protected links.
   *
   * Response codes:
   *   200  — success (dashboard + widgets + kpiValues)
   *   401  — password required or incorrect
   *   404  — token not found or revoked
   *   410  — link has expired
   */
  @Get(':token')
  @Public()
  resolve(
    @Param('token') token: string,
    @Query('password') password?: string,
  ): Promise<ShareLinkResolvedPayload> {
    return this.shareLinks.resolve(token, password);
  }
}
