import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';

const __dirname = import.meta.dirname;
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

export default [
  {
    ignores: [
      '**/.DS_Store',
      '**/node_modules',
      '**/coverage',
      '**/bin',
      '**/dist',
      '**/demo',
      '**/.env',
      '**/.env.*',
      '!**/.env.example',
      '**/pnpm-lock.yaml',
      '**/package-lock.json',
      '**/yarn.lock'
    ]
  },
  ...compat.extends('eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'),
  unicorn.configs.all,
  {
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'simple-import-sort': simpleImportSort
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },

      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module'
    },

    rules: {
      curly: ['error', 'multi'],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unicorn/filename-case': 'off',
      'unicorn/no-process-exit': 'off',
      'unicorn/switch-case-braces': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/prefer-global-this': 'off',
      'unicorn/no-nested-ternary': 'off',
      'no-alert': 'error',
      'no-debugger': 'error'
    }
  }
];
