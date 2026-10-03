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
    // Every spec drives the same live API process (and registers orgs, each a
    // bcrypt hash). Running files in parallel starves it: per-file health
    // probes time out and whole files silently skip. Run them one at a time.
    fileParallelism: false,
  },
  esbuild: {
    target: 'es2022',
  },
});
