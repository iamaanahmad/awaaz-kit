import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'spikes/**',
      '.kiro/**',
      '**/*.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
    },
    rules: {
      // Production code must use the project logger, not the console (Req 15.3).
      'no-console': 'error',
    },
  },
  {
    // Apps and shared UI must go through local-data, never Dexie directly (Req 15.10).
    files: ['apps/**/*.{ts,tsx}', 'packages/shared-ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'dexie',
              message: 'Import persistence through @awaaz-kit/local-data, not dexie directly.',
            },
            {
              name: 'dexie-react-hooks',
              message: 'Import persistence through @awaaz-kit/local-data, not dexie directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // Tests, configs and scripts may use the console and Node globals.
    files: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/tests/**',
      '**/e2e/**',
      '**/scripts/**',
      'appwrite/**',
      '*.config.{js,ts,mjs}',
      '**/*.config.{js,ts,mjs}',
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
  prettier,
);
