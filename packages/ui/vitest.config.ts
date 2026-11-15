import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Specs render components straight to markup with the automatic JSX runtime.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
