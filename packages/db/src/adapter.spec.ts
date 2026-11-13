import { describe, expect, it, vi } from 'vitest';

import { prismaAdapter } from './index.js';

// Prisma 7 removed the built-in query engine: clients connect through a driver
// adapter. Prisma 6 gave up connecting after 5 s; node-postgres waits forever by
// default, which would let /health hang on a stalled database.
describe('prismaAdapter', () => {
  it('uses the given URL and a 5 s connect timeout', () => {
    const a = prismaAdapter('postgresql://u:p@db:5432/x') as unknown as { config: Record<string, unknown> };
    expect(a.config).toMatchObject({ connectionString: 'postgresql://u:p@db:5432/x', connectionTimeoutMillis: 5_000 });
  });

  it('defaults to DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://u:p@env-db:5432/y');
    const a = prismaAdapter() as unknown as { config: Record<string, unknown> };
    expect(a.config).toMatchObject({ connectionString: 'postgresql://u:p@env-db:5432/y' });
    vi.unstubAllEnvs();
  });
});
