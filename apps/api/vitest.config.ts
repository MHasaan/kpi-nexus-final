import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['verbose'],
    // Forked processes, not worker threads: the native bcrypt addon can crash a
    // worker thread (0xC0000409) and take the whole run down with it.
    pool: 'forks',
  },
  esbuild: {
    target: 'es2022',
  },
});
