import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dist-native/**', '**/.local/**', '**/.expo/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  { files: ['**/*.{js,mjs,cjs}'], languageOptions: { globals: { module: 'readonly', require: 'readonly', __dirname: 'readonly', process: 'readonly', self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly' } } }
);
