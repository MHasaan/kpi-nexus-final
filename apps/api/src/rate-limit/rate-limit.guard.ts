import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { RequestContextStore } from '../tenancy/request-context.js';
import { RateLimitService } from './rate-limit.service.js';
import { resolveRateLimit } from './rate-limit-policy.js';

/**
 * Global rate-limit guard (registered as APP_GUARD). Env-gated: a no-op unless
 * RATE_LIMIT_ENABLED === 'true', so the default dev/test/e2e runs are
 * unaffected; production opts in via one env var. Returns 429 with a
 * Retry-After hint when a bucket is exhausted.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly enabled = process.env.RATE_LIMIT_ENABLED === 'true';

  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const path = (req.routeOptions?.url ?? req.url ?? '').split('?')[0] ?? '';
    const ip = req.ip ?? 'unknown';
    const orgId = RequestContextStore.get()?.organizationId ?? null;

    const policy = resolveRateLimit(path, ip, orgId);
    // Date.now() is allowed here (runtime guard, not a workflow script).
    const { allowed } = await this.rateLimit.consume(policy.bucketKey, policy.limit, policy.windowSec, Date.now());
    if (!allowed) {
      throw new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests; slow down',
          details: { limit: policy.limit, windowSec: policy.windowSec },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
