import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request principal + tenant identity. Populated by `TenancyInterceptor`
 * after `JwtAuthGuard` resolves the principal from the JWT.
 */
export interface RequestContext {
  userId: string;
  organizationId: string;
  roleId: string | null;
  sessionId?: string;
  principalType: 'user' | 'api_key';
  /**
   * When acting on behalf of another organization (platform-admin
   * impersonation), `organizationId` holds the impersonated tenant and
   * `realOrganizationId` holds the actor's home org.
   */
  realOrganizationId?: string;
  apiKeyId?: string;
  apiKeyScopes?: readonly string[];
  tenantSlug?: string;
  /**
   * When true, RLS service_role_bypass policy fires — for migrations,
   * cross-tenant cleanup jobs, and platform-admin reads.
   */
  bypassRls?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

export class NoRequestContextError extends Error {
  constructor() {
    super(
      'No request context available. This service must run inside a request handled by TenancyInterceptor, ' +
        'or inside RequestContextStore.run()/runWithBypass().',
    );
    this.name = 'NoRequestContextError';
  }
}

/**
 * AsyncLocalStorage-backed request scope. Read via `get()` or `require()`,
 * wrap async work via `run()`/`runWithBypass()`.
 */
export const RequestContextStore = {
  /**
   * Wrap async work in a fresh context. The context is visible to all
   * descendants of `fn` (including awaits) but invisible to siblings.
   */
  run<T>(ctx: RequestContext, fn: () => T | Promise<T>): T | Promise<T> {
    return storage.run(ctx, fn);
  },

  /**
   * Wrap a deliberate cross-tenant operation (platform admin, scheduled
   * cleanup) so RLS short-circuits via `service_role_bypass`. The reason
   * argument is for audit log clarity only — callers should still audit the
   * bypass via `AuditService.recordBypass()`.
   */
  runWithBypass<T>(reason: string, fn: () => T | Promise<T>): T | Promise<T> {
    const current = storage.getStore();
    const next: RequestContext = current
      ? { ...current, bypassRls: true }
      : {
          userId: 'platform-bypass',
          organizationId: 'platform-bypass',
          roleId: null,
          principalType: 'user',
          bypassRls: true,
        };
    // reason intentionally not stored on the context; callers log it
    void reason;
    return storage.run(next, fn);
  },

  /** Returns the active context or `undefined` outside a request. */
  get(): RequestContext | undefined {
    return storage.getStore();
  },

  /**
   * Returns the active context or throws — use in services that MUST run
   * inside a tenant request.
   */
  require(): RequestContext {
    const ctx = storage.getStore();
    if (!ctx) throw new NoRequestContextError();
    return ctx;
  },
};

/**
 * Type-erased resolver suitable for `@kpi-nexus/db`'s context resolver. Wires
 * RLS GUCs into the Prisma middleware without coupling the package to NestJS.
 */
export const resolveTenantContextForDb = (): { organizationId?: string; bypassRls?: boolean } | undefined => {
  const ctx = storage.getStore();
  if (!ctx) return undefined;
  return {
    organizationId: ctx.organizationId === 'platform-bypass' ? undefined : ctx.organizationId,
    bypassRls: ctx.bypassRls === true,
  };
};
