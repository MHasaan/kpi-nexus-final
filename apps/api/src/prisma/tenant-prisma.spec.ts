import { describe, expect, it, vi } from 'vitest';

import { NoTenantContextError, createTenantPrisma, rlsEnforced } from './tenant-prisma.js';

/**
 * A fake PrismaClient: model delegates record calls and resolve to a tagged
 * result; $transaction supports both the batch (array) and interactive forms;
 * $executeRaw / $queryRaw record the template + values.
 */
function fakeClient(name: string) {
  const calls: Array<{ kind: string; detail: unknown }> = [];
  const raw = (kind: string) =>
    vi.fn((strings: TemplateStringsArray | string, ...values: unknown[]) => {
      calls.push({ kind, detail: { sql: Array.isArray(strings) ? strings.join('?') : strings, values } });
      return Promise.resolve(`${name}:${kind}`);
    });
  // Interactive transactions hand the fake itself to the callback (set below).
  const self: { client?: unknown } = {};
  const client = {
    calls,
    user: {
      findMany: vi.fn((args: unknown) => {
        calls.push({ kind: 'user.findMany', detail: args });
        return Promise.resolve([`${name}:user`]);
      }),
      update: vi.fn((args: unknown) => {
        calls.push({ kind: 'user.update', detail: args });
        return Promise.resolve(`${name}:updated`);
      }),
    },
    $executeRaw: raw('$executeRaw'),
    $queryRaw: raw('$queryRaw'),
    $queryRawUnsafe: raw('$queryRawUnsafe'),
    $connect: vi.fn(async () => undefined),
    $transaction: vi.fn(async (arg: unknown, _opts?: unknown) => {
      if (Array.isArray(arg)) {
        calls.push({ kind: '$transaction[]', detail: arg.length });
        return Promise.all(arg);
      }
      calls.push({ kind: '$transaction(fn)', detail: null });
      return (arg as (tx: unknown) => Promise<unknown>)(self.client);
    }),
  };
  self.client = client;
  return client;
}

function setup(ctx: { organizationId: string; bypassRls?: boolean } | undefined) {
  const base = fakeClient('base');
  const system = fakeClient('system');
  const prisma = createTenantPrisma(base as never, system as never, () => ctx) as unknown as typeof base;
  return { base, system, prisma };
}

const setOrgCall = (org: string) => ({
  kind: '$executeRaw',
  detail: { sql: "SELECT set_config('app.current_org', ?, true)", values: [org] },
});

describe('createTenantPrisma (OT-014)', () => {
  it('runs a model query inside a transaction that first sets the org (transaction-local)', async () => {
    const { base, system, prisma } = setup({ organizationId: 'org_a' });
    const rows = await prisma.user.findMany({ where: { email: 'x' } });
    expect(rows).toEqual(['base:user']);
    expect(base.calls).toEqual([
      setOrgCall('org_a'),
      { kind: 'user.findMany', detail: { where: { email: 'x' } } },
      { kind: '$transaction[]', detail: 2 },
    ]);
    expect(system.calls).toEqual([]);
  });

  it('fails closed with no request context — nothing reaches the database', async () => {
    const { base, system, prisma } = setup(undefined);
    await expect(prisma.user.findMany({})).rejects.toBeInstanceOf(NoTenantContextError);
    expect(base.calls).toEqual([]);
    expect(system.calls).toEqual([]);
  });

  it('a bypass context (runWithBypass) runs on the system client, with no org set', async () => {
    const { base, system, prisma } = setup({ organizationId: 'platform-bypass', bypassRls: true });
    expect(await prisma.user.findMany({})).toEqual(['system:user']);
    expect(base.calls).toEqual([]);
    expect(system.calls.map((c) => c.kind)).toEqual(['user.findMany']);
  });

  it('a query keeps the context it was created in, even when awaited outside it', async () => {
    let ctx: { organizationId: string; bypassRls?: boolean } | undefined = { organizationId: 'sys', bypassRls: true };
    const base = fakeClient('base');
    const system = fakeClient('system');
    const prisma = createTenantPrisma(base as never, system as never, () => ctx) as unknown as typeof base;
    // e.g. `runWithBypass(() => prisma.user.findMany())` returns the unawaited query
    const q = prisma.user.findMany({});
    ctx = undefined;
    expect(await q).toEqual(['system:user']);
  });

  it('batch $transaction([...]) prepends the org once and returns only the callers results', async () => {
    const { base, prisma } = setup({ organizationId: 'org_a' });
    const out = await (prisma as unknown as { $transaction: (a: unknown[]) => Promise<unknown[]> }).$transaction([
      prisma.user.findMany({}),
      prisma.user.update({ where: { id: 'u1' }, data: {} }),
    ]);
    expect(out).toEqual([['base:user'], 'base:updated']);
    expect(base.calls[0]).toEqual(setOrgCall('org_a'));
    expect(base.calls.at(-1)).toEqual({ kind: '$transaction[]', detail: 3 });
  });

  it('interactive $transaction(fn) sets the org first on the transaction, then runs fn on the raw tx', async () => {
    const { base, prisma } = setup({ organizationId: 'org_b' });
    const tx = vi.fn(async (t: { user: { findMany: (a: unknown) => Promise<unknown> } }) => t.user.findMany({}));
    const out = await (prisma as unknown as { $transaction: (f: typeof tx) => Promise<unknown> }).$transaction(tx);
    expect(out).toEqual(['base:user']);
    expect(base.calls.map((c) => c.kind)).toEqual(['$transaction(fn)', '$executeRaw', 'user.findMany']);
    expect(base.calls[1]).toEqual(setOrgCall('org_b'));
  });

  it('interactive transactions under bypass run on the system client without setting an org', async () => {
    const { base, system, prisma } = setup({ organizationId: 'org_x', bypassRls: true });
    await (prisma as unknown as { $transaction: (f: (t: unknown) => Promise<unknown>) => Promise<unknown> }).$transaction(
      async (t) => (t as typeof system).user.findMany({}),
    );
    expect(base.calls).toEqual([]);
    expect(system.calls.map((c) => c.kind)).toEqual(['$transaction(fn)', 'user.findMany']);
  });

  it('raw queries ($queryRaw tagged, $queryRawUnsafe) are wrapped the same way', async () => {
    const { base, prisma } = setup({ organizationId: 'org_a' });
    const id = 'k1';
    await (prisma as unknown as { $queryRaw: (s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown> })
      .$queryRaw`SELECT 1 WHERE id = ${id}`;
    await (prisma as unknown as { $queryRawUnsafe: (s: string, ...v: unknown[]) => Promise<unknown> }).$queryRawUnsafe(
      'SELECT $1',
      'v',
    );
    const kinds = base.calls.map((c) => c.kind);
    expect(kinds).toEqual(['$executeRaw', '$queryRaw', '$transaction[]', '$executeRaw', '$queryRawUnsafe', '$transaction[]']);
  });

  it('deferred queries behave like promises (catch / finally)', async () => {
    const { prisma } = setup(undefined);
    const caught = await prisma.user.findMany({}).catch((e: unknown) => (e instanceof NoTenantContextError ? 'caught' : 'other'));
    expect(caught).toBe('caught');
    const done = vi.fn();
    await prisma.user.findMany({}).catch(() => undefined).finally(done);
    expect(done).toHaveBeenCalled();
  });

  it('client-level members ($connect) are forwarded to both clients', async () => {
    const { base, system, prisma } = setup({ organizationId: 'org_a' });
    await (prisma as unknown as { $connect: () => Promise<void> }).$connect();
    expect(base.$connect).toHaveBeenCalled();
    expect(system.$connect).toHaveBeenCalled();
  });
});

describe('rlsEnforced', () => {
  it('is on only for RLS_ENFORCED=true', () => {
    expect(rlsEnforced({})).toBe(false);
    expect(rlsEnforced({ RLS_ENFORCED: 'false' })).toBe(false);
    expect(rlsEnforced({ RLS_ENFORCED: 'true' })).toBe(true);
  });
});
