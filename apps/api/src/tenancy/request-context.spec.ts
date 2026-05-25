import { describe, expect, test } from 'vitest';

import {
  NoRequestContextError,
  type RequestContext,
  RequestContextStore,
  resolveTenantContextForDb,
} from './request-context.js';

const sampleCtx: RequestContext = {
  userId: 'user_123',
  organizationId: 'org_abc',
  roleId: 'role_1',
  principalType: 'user',
};

describe('RequestContextStore', () => {
  test('get() returns undefined outside a run() scope', () => {
    expect(RequestContextStore.get()).toBeUndefined();
  });

  test('require() throws outside a run() scope', () => {
    expect(() => RequestContextStore.require()).toThrowError(NoRequestContextError);
  });

  test('run() exposes the context synchronously inside the callback', () => {
    const result = RequestContextStore.run(sampleCtx, () => {
      return RequestContextStore.require();
    });
    expect(result).toBe(sampleCtx);
  });

  test('run() propagates context through awaits (AsyncLocalStorage)', async () => {
    const seen = await RequestContextStore.run(sampleCtx, async () => {
      await Promise.resolve();
      await Promise.resolve();
      return RequestContextStore.require();
    });
    expect(seen).toEqual(sampleCtx);
  });

  test('context does not leak to siblings outside the run() callback', async () => {
    const captureOutside = async (): Promise<RequestContext | undefined> => {
      await Promise.resolve();
      return RequestContextStore.get();
    };
    await RequestContextStore.run(sampleCtx, () => Promise.resolve());
    expect(await captureOutside()).toBeUndefined();
  });

  test('runWithBypass() inherits the surrounding context and turns on bypassRls', async () => {
    const inner = await RequestContextStore.run(sampleCtx, async () => {
      return RequestContextStore.runWithBypass('cleanup job', () =>
        RequestContextStore.require(),
      );
    });
    expect(inner.bypassRls).toBe(true);
    expect(inner.userId).toBe(sampleCtx.userId);
    expect(inner.organizationId).toBe(sampleCtx.organizationId);
  });

  test('runWithBypass() works outside any prior context (platform jobs)', async () => {
    const inner = await RequestContextStore.runWithBypass('migration', () =>
      Promise.resolve(RequestContextStore.require()),
    );
    expect(inner.bypassRls).toBe(true);
    expect(inner.organizationId).toBe('platform-bypass');
  });

  test('resolveTenantContextForDb() returns undefined outside any scope', () => {
    expect(resolveTenantContextForDb()).toBeUndefined();
  });

  test('resolveTenantContextForDb() exposes organizationId + bypass flag', async () => {
    const v = await RequestContextStore.run(sampleCtx, () =>
      Promise.resolve(resolveTenantContextForDb()),
    );
    expect(v).toEqual({ organizationId: 'org_abc', bypassRls: false });
  });

  test('resolveTenantContextForDb() masks the platform-bypass sentinel', async () => {
    const v = await RequestContextStore.runWithBypass('admin', () =>
      Promise.resolve(resolveTenantContextForDb()),
    );
    expect(v).toEqual({ organizationId: undefined, bypassRls: true });
  });
});
