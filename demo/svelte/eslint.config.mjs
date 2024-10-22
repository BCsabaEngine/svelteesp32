import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tailwindcss from 'eslint-plugin-tailwindcss';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import parser from 'svelte-eslint-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default [
	{
		ignores: [
			'**/*.cjs',
			'**/.DS_Store',
			'**/node_modules',
			'**/dist',
			'.svelte-kit',
			'**/.env',
			'**/.env.*',
			'!**/.env.example',
			'**/pnpm-lock.yaml',
			'**/package-lock.json',
			'**/yarn.lock'
		]
	},
	...compat.extends(
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:svelte/recommended',
		'plugin:unicorn/all',
		'plugin:tailwindcss/recommended',
		'prettier'
	),
	{
		plugins: {
			'@typescript-eslint': typescriptEslint,
			'simple-import-sort': simpleImportSort,
			unicorn,
			tailwindcss
		},

		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			},

			parser: tsParser,
			ecmaVersion: 2020,
			sourceType: 'module',

			parserOptions: {
				extraFileExtensions: ['.svelte']
			}
		},

		rules: {
			'simple-import-sort/imports': 'error',
			'simple-import-sort/exports': 'error',
			'unicorn/filename-case': 'off',
			'unicorn/prefer-global-this': 'off',
			'no-alert': 'error',
			'no-console': 'error',
			'no-debugger': 'error'
		}
	},
	{
		files: ['**/*.svelte'],

		languageOptions: {
			parser: parser,
			ecmaVersion: 5,
			sourceType: 'script',

			parserOptions: {
				parser: '@typescript-eslint/parser'
			}
		}
	}
];
