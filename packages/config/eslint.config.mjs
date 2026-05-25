import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.d.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Disabled — autofix converts NestJS DI-injected classes to `type`
      // imports, which strips the runtime reference NestJS needs for
      // `design:paramtypes` metadata. The rule's benefit (slightly smaller
      // emit) is not worth the DI footgun. Re-enable selectively per
      // package if/when a static-only consumer wants it.
      '@typescript-eslint/consistent-type-imports': 'off',
      'sort-imports': ['warn', { ignoreDeclarationSort: true }],
    },
  },
);
