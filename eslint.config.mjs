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
      'no-debugger': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/method-signature-style': ['error', 'property']
    }
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-shadow': 'off'
    }
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error'
    }
  }
];
