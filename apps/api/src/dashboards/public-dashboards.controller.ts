import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { Public } from '../rbac/decorators/public.decorator.js';
import { type ShareLinkResolvedPayload, ShareLinksService } from './share-links.service.js';
import { ResolveShareDtoSchema } from './dto/dashboard.dto.js';

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
   * No password accepted here — for password-protected links the client
   * receives 401 { code: 'PASSWORD_REQUIRED' } and must use POST instead.
   *
   * Response codes:
   *   200  — success (dashboard + widgets + kpiValues)
   *   401  — password required (code: PASSWORD_REQUIRED)
   *   404  — token not found or revoked
   *   410  — link has expired
   */
  @Get(':token')
  @Public()
  resolve(@Param('token') token: string): Promise<ShareLinkResolvedPayload> {
    return this.shareLinks.resolve(token);
  }

  /**
   * POST /public/dashboards/:token
   *
   * Submit a password for a password-protected share link.
   * Password is supplied in the JSON body (never in the URL/query string).
   *
   * Response codes:
   *   200  — success (dashboard + widgets + kpiValues)
   *   400  — invalid body
   *   401  — wrong password (code: INVALID_PASSWORD)
   *   404  — token not found or revoked
   *   410  — link has expired
   */
  @Post(':token')
  @Public()
  @HttpCode(HttpStatus.OK)
  resolveWithPassword(
    @Param('token') token: string,
    @Body() body: unknown,
  ): Promise<ShareLinkResolvedPayload> {
    const { password } = parse(ResolveShareDtoSchema, body);
    return this.shareLinks.resolve(token, password);
  }
}
