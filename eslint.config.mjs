import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['src/**/*'],
    plugins: { js },
    extends: ['js/recommended'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['src/**/*'],
    languageOptions: { globals: globals.browser },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  tseslint.configs.recommended,
]);
