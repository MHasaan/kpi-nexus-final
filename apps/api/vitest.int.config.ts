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
 * A global setup probes the api first and FAILS the run when it is
 * unreachable (OT-006: specs used to early-return and report "passed"
 * while testing nothing). INTEGRATION_ALLOW_NO_API=1 runs only the specs
 * that don't need it.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
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
