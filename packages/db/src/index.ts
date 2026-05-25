import { PrismaClient } from '@prisma/client';

/**
 * Per-request tenant context. The api wires its AsyncLocalStorage-backed
 * RequestContextStore in via `setTenantContextResolver`.
 *
 * NOTE (P1 initial commit): the Prisma middleware that previously set
 * Postgres `app.current_org` / `app.bypass_rls` GUCs was removed because
 * Prisma 6 dropped `$use` in favor of `$extends`. RLS policies exist on
 * every tenant-scoped table (see prisma/sql/rls-policies.sql) but currently
 * the Prisma client connects as the `kpi_nexus` table-owner role, which
 * bypasses RLS by default. App-level org filtering in services is the
 * effective enforcement at this point. A future P1 commit will:
 *   1. Create a non-owner app role with RLS forced,
 *   2. Wire GUC setting via $extends + connection pooling.
 * Until then the resolver below is unused but kept so callers can register
 * it without code churn later.
 */
export interface TenantContext {
  organizationId?: string;
  bypassRls?: boolean;
}

type ContextResolver = () => TenantContext | undefined;

let contextResolver: ContextResolver = () => undefined;

export function setTenantContextResolver(fn: ContextResolver): void {
  contextResolver = fn;
}

/** Internal — exposed for the future RLS wiring. */
export function getTenantContext(): TenantContext | undefined {
  return contextResolver();
}

const globalForPrisma = globalThis as unknown as {
  __kpiNexusPrisma?: PrismaClient;
};

const createClient = (): PrismaClient =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

/**
 * Singleton PrismaClient. NestJS apps wrap this with an injectable
 * PrismaService; scripts and standalone tooling can import `prisma` directly.
 * In development we cache the instance on globalThis so hot-reload doesn't
 * leak connections.
 */
export const prisma: PrismaClient =
  globalForPrisma.__kpiNexusPrisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__kpiNexusPrisma = prisma;
}

export { PrismaClient } from '@prisma/client';
export type { Prisma } from '@prisma/client';
