import { defineConfig } from 'vitest/config';

/**
 * Integration test config — runs live against the api on localhost:4000
 * (and the docker-compose Postgres + Redis behind it).
 *
 *   pnpm docker:up
 *   pnpm db:setup
 *   pnpm --filter @kpi-nexus/api start       # in one terminal
 *   pnpm --filter @kpi-nexus/api test:int    # in another
 *
 * Specs skip themselves with a clear message when the api isn't
 * reachable, so this config is safe to run unconditionally in CI gates
 * that don't yet boot the api.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    reporters: ['verbose'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  esbuild: {
    target: 'es2022',
  },
});
