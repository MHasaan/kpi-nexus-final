import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '.next/**',
        '.turbo/**',
        'coverage/**',
        '**/*.config.{ts,js,mjs}',
        '**/*.d.ts',
        '**/*.spec.{ts,tsx}',
      ],
    },
    reporters: ['verbose'],
  },
});
