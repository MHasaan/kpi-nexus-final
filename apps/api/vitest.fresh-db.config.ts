import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/fresh-db/**/*.spec.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    reporters: ['verbose'],
    fileParallelism: false,
  },
  esbuild: { target: 'es2022' },
});
