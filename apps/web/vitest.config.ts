import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // Transform JSX in .tsx spec files using the automatic React JSX runtime.
    // This lets component tests call component functions directly without
    // needing jsdom / @testing-library/react — React is already a dependency.
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    reporters: ['verbose'],
  },
});
