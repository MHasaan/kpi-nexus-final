import {
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../../rbac/decorators/public.decorator.js';

/**
 * Global auth gate. `@Public()` opts out. After validation, `req.user` holds
 * the RequestContext that TenancyInterceptor reads.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<T>(err: unknown, user: T): T {
    if (err || !user) {
      throw err instanceof Error
        ? err
        : new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
    }
    return user;
  }
}
