import type { PrismaClient } from '@kpi-nexus/db';

/**
 * Row-level-security enforcement for the API's Prisma access (OT-014, option A
 * of docs/superpowers/specs/2026-10-09-tenant-isolation-plan.md).
 *
 * `createTenantPrisma(base, system, getCtx)` returns a PrismaClient look-alike:
 *
 * - `base` connects as `kpi_app` (no bypass). Every model / raw query runs in a
 *   small batch transaction that FIRST runs
 *   `set_config('app.current_org', <org>, true)` — `true` makes it local to that
 *   transaction, so a pooled connection never carries one request's org into
 *   another. The Postgres policies then show only that org's rows.
 * - `system` connects as `kpi_system` (BYPASSRLS by role). Code running inside
 *   `RequestContextStore.runWithBypass()` (pre-login lookups, background jobs) is
 *   routed there; there is no variable a request could set to bypass.
 * - No request context ⇒ `NoTenantContextError` before anything reaches the
 *   database (fail closed).
 *
 * Transactions: `$transaction([...])` prepends the org setter once;
 * `$transaction(fn)` sets it at the start of the interactive transaction and
 * hands `fn` the raw transaction client (its queries share that connection).
 */

export interface TenantContextLike {
  organizationId: string;
  bypassRls?: boolean;
}

export class NoTenantContextError extends Error {
  constructor() {
    super(
      'Database access without a tenant context (RLS is enforced). Run inside a request, ' +
        'RequestContextStore.run() or RequestContextStore.runWithBypass().',
    );
    this.name = 'NoTenantContextError';
  }
}

/** RLS enforcement is on only with RLS_ENFORCED=true (default off — today's behaviour). */
export function rlsEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.RLS_ENFORCED === 'true';
}

type AnyClient = Record<string | symbol, unknown> & {
  $transaction: (arg: unknown, opts?: unknown) => Promise<unknown>;
  $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
};

const RAW_METHODS = new Set(['$queryRaw', '$executeRaw', '$queryRawUnsafe', '$executeRawUnsafe']);

/** The org setter, as a batch-able Prisma promise on `client`. */
function setOrg(client: AnyClient, organizationId: string): unknown {
  return client.$executeRaw`SELECT set_config('app.current_org', ${organizationId}, true)`;
}

/**
 * A query described but not yet sent. It runs (wrapped) when awaited, or is
 * unpacked by `$transaction([...])` and re-built on the right client — so the
 * familiar `await prisma.x.findMany()` and `prisma.$transaction([q1, q2])`
 * forms both keep working.
 */
class DeferredQuery<T = unknown> implements PromiseLike<T> {
  private running: Promise<T> | undefined;

  constructor(
    private readonly runner: TenantRunner,
    /** Builds the real Prisma promise on a given client. */
    readonly build: (client: AnyClient) => unknown,
    /**
     * The tenant context where the query was CREATED. Captured now because
     * `runWithBypass(() => prisma.x.findFirst())` hands back the unawaited
     * query, which then runs after the bypass scope has ended.
     */
    readonly ctx: TenantContextLike | undefined,
  ) {}

  private start(): Promise<T> {
    this.running ??= this.runner.runOne(this) as Promise<T>;
    return this.running;
  }

  then<R1 = T, R2 = never>(
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.start().then(onFulfilled, onRejected);
  }

  catch<R = never>(onRejected?: ((reason: unknown) => R | PromiseLike<R>) | null): Promise<T | R> {
    return this.start().catch(onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<T> {
    return this.start().finally(onFinally);
  }

  get [Symbol.toStringTag](): string {
    return 'DeferredQuery';
  }
}

class TenantRunner {
  constructor(
    private readonly base: AnyClient,
    private readonly system: AnyClient,
    private readonly getCtx: () => TenantContextLike | undefined,
  ) {}

  private requireCtx(captured?: TenantContextLike): TenantContextLike {
    const ctx = captured ?? this.getCtx();
    if (!ctx) throw new NoTenantContextError();
    return ctx;
  }

  async runOne(q: DeferredQuery): Promise<unknown> {
    const ctx = this.requireCtx(q.ctx);
    if (ctx.bypassRls) return q.build(this.system);
    const [, result] = (await this.base.$transaction([setOrg(this.base, ctx.organizationId), q.build(this.base)])) as [
      unknown,
      unknown,
    ];
    return result;
  }

  async runBatch(items: unknown[], opts: unknown): Promise<unknown[]> {
    const ctx = this.requireCtx();
    const queries = items.map((item) => {
      if (!(item instanceof DeferredQuery)) {
        throw new TypeError('$transaction([...]) only accepts queries built from the same client');
      }
      return item;
    });
    if (ctx.bypassRls) {
      return (await this.system.$transaction(queries.map((q) => q.build(this.system)), opts)) as unknown[];
    }
    const results = (await this.base.$transaction(
      [setOrg(this.base, ctx.organizationId), ...queries.map((q) => q.build(this.base))],
      opts,
    )) as unknown[];
    return results.slice(1);
  }

  async runInteractive(fn: (tx: unknown) => Promise<unknown>, opts: unknown): Promise<unknown> {
    const ctx = this.requireCtx();
    if (ctx.bypassRls) return this.system.$transaction(fn, opts);
    return this.base.$transaction(async (tx: unknown) => {
      await setOrg(tx as AnyClient, ctx.organizationId);
      return fn(tx);
    }, opts);
  }

  deferred(build: (client: AnyClient) => unknown): DeferredQuery {
    return new DeferredQuery(this, build, this.getCtx());
  }
}

/** Wrap `base` (kpi_app) + `system` (kpi_system) into one RLS-enforcing client. */
export function createTenantPrisma<T extends object>(
  base: T,
  system: T,
  getCtx: () => TenantContextLike | undefined,
): T {
  const b = base as unknown as AnyClient;
  const s = system as unknown as AnyClient;
  const runner = new TenantRunner(b, s, getCtx);
  const delegateCache = new Map<string, unknown>();

  const modelDelegate = (model: string): unknown => {
    let proxy = delegateCache.get(model);
    if (!proxy) {
      proxy = new Proxy(
        {},
        {
          get: (_t, op) => {
            if (typeof op !== 'string') return undefined;
            return (...args: unknown[]) =>
              runner.deferred((client) => {
                const delegate = client[model] as Record<string, (...a: unknown[]) => unknown>;
                return delegate[op]!(...args);
              });
          },
        },
      );
      delegateCache.set(model, proxy);
    }
    return proxy;
  };

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return (arg: unknown, opts?: unknown) =>
          Array.isArray(arg)
            ? runner.runBatch(arg, opts)
            : runner.runInteractive(arg as (tx: unknown) => Promise<unknown>, opts);
      }
      if (typeof prop === 'string' && RAW_METHODS.has(prop)) {
        return (...args: unknown[]) =>
          runner.deferred((client) => (client[prop] as (...a: unknown[]) => unknown)(...args));
      }
      // Connection management + Nest lifecycle hooks apply to both clients.
      if (
        prop === '$connect' ||
        prop === '$disconnect' ||
        prop === 'onModuleInit' ||
        prop === 'onModuleDestroy'
      ) {
        return async () => {
          for (const c of [b, s]) {
            const fn = c[prop];
            if (typeof fn === 'function') await (fn as () => Promise<void>).call(c);
          }
        };
      }
      const value = Reflect.get(target, prop, receiver);
      // Model delegates (user, kPI, ...) are the non-$ properties with query methods.
      if (
        typeof prop === 'string' &&
        !prop.startsWith('$') &&
        value !== null &&
        typeof value === 'object' &&
        typeof (value as { findMany?: unknown }).findMany === 'function'
      ) {
        return modelDelegate(prop);
      }
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as T;
}

/** Re-exported for typing convenience in the provider. */
export type { PrismaClient };
