import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';

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
  js.configs.recommended,
  ...typescriptEslint.configs['flat/recommended'],
  prettierConfig,
  unicorn.configs.all,
  {
    files: ['test/fixtures/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSort
    },

    languageOptions: {
      globals: {
        ...globals.node
      },

      ecmaVersion: 2023,
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
