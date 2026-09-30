// Flat ESLint config for the whole monorepo.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '.vercel/**', '.static/**', '.data/**', 'design/**', 'packages/db/drizzle/**', 'packages/db/seed/tools/**', '**/*.d.ts', 'coverage/**', 'e2e/test-results/**', 'e2e/playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // SYS-AI-10: only the AI gateway's client module may talk to the Anthropic SDK.
      'no-restricted-imports': ['error', { paths: [{ name: '@anthropic-ai/sdk', message: 'Call Claude only through @clubhouse/ai-gateway.' }] }],
    },
  },
  { files: ['packages/ai-gateway/src/client.ts'], rules: { 'no-restricted-imports': 'off' } },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  { files: ['apps/web/src/sw.ts'], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ['**/scripts/**', '**/test/**', 'e2e/**', '*.config.{js,ts}'], rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'off' } },
);
