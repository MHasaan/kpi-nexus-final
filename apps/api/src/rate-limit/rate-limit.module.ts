import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimitService } from './rate-limit.service.js';

/**
 * RateLimitModule — registers a global, env-gated rate-limit guard backed by a
 * Redis sliding window. Off by default (RATE_LIMIT_ENABLED !== 'true').
 */
@Module({
  providers: [RateLimitService, { provide: APP_GUARD, useClass: RateLimitGuard }],
  exports: [RateLimitService],
})
export class RateLimitModule {}
