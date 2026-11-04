import { describe, expect, it } from 'vitest';

import { prismaServiceFactory } from './prisma.module.js';

describe('prismaServiceFactory (OT-014)', () => {
  it('without RLS_ENFORCED returns a plain PrismaService', () => {
    // Prisma's constructor returns its own proxy, so check shape, not instanceof.
    const client = prismaServiceFactory({});
    expect(typeof client.$connect).toBe('function');
    expect(typeof client.user.findMany).toBe('function');
  });

  it('RLS_ENFORCED=true without the role URLs fails the boot instead of running unenforced', () => {
    expect(() => prismaServiceFactory({ RLS_ENFORCED: 'true' })).toThrow(/DATABASE_URL_APP/);
    expect(() =>
      prismaServiceFactory({ RLS_ENFORCED: 'true', DATABASE_URL_APP: 'postgresql://a@x/db' }),
    ).toThrow(/DATABASE_URL_SYSTEM/);
  });
});
