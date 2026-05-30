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
import { z, type ZodTypeAny, type infer as ZInfer } from 'zod';

import { RequestContextStore } from '../tenancy/request-context.js';
import { type ActiveSessionInfo, RefreshTokenService } from './services/refresh-token.service.js';

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

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

const RevokeAllBodySchema = z
  .object({
    keepCurrentRefreshToken: z.string().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * Self-service session-management endpoints for the currently authenticated
 * user. No special permissions are required — users can only manage their own
 * sessions (enforced by ctx.userId in every service call).
 *
 * Routes:
 *   GET  /me/sessions              — list active sessions
 *   DELETE /me/sessions/:id        — revoke one session (204)
 *   POST /me/sessions/revoke-all   — revoke all sessions, optionally keeping current
 */
@Controller('me/sessions')
export class MeSessionsController {
  constructor(private readonly refreshTokens: RefreshTokenService) {}

  @Get()
  async list(): Promise<ActiveSessionInfo[]> {
    const ctx = RequestContextStore.require();
    return this.refreshTokens.listActiveForUser(ctx.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOne(@Param('id') id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.refreshTokens.revokeOne(ctx.userId, id);
  }

  @Post('revoke-all')
  @HttpCode(HttpStatus.OK)
  async revokeAll(@Body() body: unknown): Promise<{ revoked: number }> {
    const ctx = RequestContextStore.require();
    const dto = parse(RevokeAllBodySchema, body);
    return this.refreshTokens.revokeAllExcept(ctx.userId, dto.keepCurrentRefreshToken);
  }
}
