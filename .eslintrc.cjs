module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:unicorn/all', 'prettier'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'simple-import-sort', 'unicorn'],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2020
  },
  rules: {
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'unicorn/filename-case': 'off',
    'unicorn/no-process-exit': 'off',
    'unicorn/switch-case-braces': 'off',
    'unicorn/no-array-reduce': 'off',
    'no-alert': 'error',
    'no-debugger': 'error'
  },
  env: {
    browser: true,
    es2017: true,
    node: true
  }
};
