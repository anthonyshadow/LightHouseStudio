import eslint from '@eslint/js';
import hooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// These media elements render user/provider streams. No timed-text source exists, so captions
// cannot be synthesized truthfully; both components provide an accessible name and nearby copy.
const dynamicMediaWithoutCaptionSource = [
  'apps/web/src/features/live-stage/MediaStage.tsx',
  'apps/web/src/features/voice-effects/VoicePreview.tsx',
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'playwright-report/**', 'test-results/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts', 'vitest.setup.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': hooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...hooks.configs.flat.recommended.rules,
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/unbound-method': 'error',
      'jsx-a11y/media-has-caption': 'error',
      'react-hooks/set-state-in-effect': 'error',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      'apps/api/**/*.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'scripts/**/*.{js,mjs,cjs}',
      '*.{js,mjs,cjs,ts}',
      'apps/*/vite.config*.ts',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**', 'e2e/**'],
    rules: {
      // Spy/mock APIs are intentionally passed as first-class values in tests.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: dynamicMediaWithoutCaptionSource,
    rules: {
      'jsx-a11y/media-has-caption': 'off',
    },
  },
);
