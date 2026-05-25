import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, from, switchMap } from 'rxjs';

import { type RequestContext, RequestContextStore } from './request-context.js';

/**
 * Reads the resolved principal from `req.user` (populated by JwtAuthGuard or
 * an api-key strategy) and wraps the rest of the request in
 * `RequestContextStore.run({...})` so every downstream service can see the
 * tenant context (via `RequestContextStore.get/require()`) and Prisma can set
 * the `app.current_org` GUC for RLS.
 *
 * For `@Public()` routes that never run a guard, no context is set — the
 * route handler must not depend on tenant context.
 */
@Injectable()
export class TenancyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: RequestContext }>();
    const principal = request.user;

    if (!principal) {
      return next.handle();
    }

    return from(
      Promise.resolve(
        RequestContextStore.run(principal, () =>
          new Promise<unknown>((resolve, reject) => {
            next
              .handle()
              .subscribe({ next: resolve, error: reject, complete: () => resolve(undefined) });
          }),
        ),
      ),
    ).pipe(switchMap((v) => from(Promise.resolve(v))));
  }
}
