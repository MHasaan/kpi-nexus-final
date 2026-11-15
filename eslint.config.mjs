import baseConfig from './packages/config/eslint.config.mjs';

export default [
  ...baseConfig,
  {
    ignores: [
      '**/dist/**',
      '**/storybook-static/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.tsbuildinfo',
      'apps/ml/**',
      '.remember/**',
    ],
  },
];
