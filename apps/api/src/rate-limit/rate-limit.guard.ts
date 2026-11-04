import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import type { RequestContext } from '../tenancy/request-context.js';
import { RateLimitService } from './rate-limit.service.js';
import { budgetsFromEnv, rateLimitEnabled, resolveRateLimits, type RateLimitRequest } from './rate-limit-policy.js';

/**
 * Global rate-limit guard (registered as APP_GUARD). ON by default; set
 * RATE_LIMIT_ENABLED=false to disable. Budgets are configurable (see
 * rate-limit-policy.ts). Returns 429 when any bucket for the request is
 * exhausted. If Redis is unavailable the service fails open.
 */
/**
 * The signed-in principal for bucketing. Guards run BEFORE the tenancy
 * interceptor, so RequestContextStore is still empty here; JwtAuthGuard (an
 * earlier global guard) has already put the principal on req.user.
 */
function principalOf(req: FastifyRequest): RateLimitRequest['principal'] {
  const user = (req as FastifyRequest & { user?: Partial<RequestContext> }).user;
  if (!user?.userId) return null;
  if (user.principalType === 'api_key' && user.apiKeyId) return { type: 'api_key', id: user.apiKeyId };
  return { type: 'user', id: user.userId };
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly enabled = rateLimitEnabled();
  private readonly budgets = budgetsFromEnv();

  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const policies = resolveRateLimits(
      {
        path: (req.routeOptions?.url ?? req.url ?? '').split('?')[0] ?? '',
        ip: req.ip ?? 'unknown',
        principal: principalOf(req),
        method: req.method,
        body: req.body,
      },
      this.budgets,
    );

    for (const policy of policies) {
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
    }
    return true;
  }
}
