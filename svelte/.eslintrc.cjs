module.exports = {
	root: true,
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:svelte/recommended',
		'plugin:unicorn/all',
		'plugin:sonarjs/recommended',
		'plugin:tailwindcss/recommended',
		'prettier'
	],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'simple-import-sort', 'unicorn', 'sonarjs', 'tailwindcss'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		extraFileExtensions: ['.svelte']
	},
	rules: {
		'simple-import-sort/imports': 'error',
		'simple-import-sort/exports': 'error',
		'unicorn/filename-case': 'off',
		'no-alert': 'error',
		'no-console': 'error',
		'no-debugger': 'error',
		'sonarjs/cognitive-complexity': 'off',
		'sonarjs/no-unused-collection': 'off'
	},
	env: {
		browser: true,
		es2017: true,
		node: true
	},
	overrides: [
		{
			files: ['*.svelte'],
			parser: 'svelte-eslint-parser',
			parserOptions: {
				parser: '@typescript-eslint/parser'
			}
		}
	]
};
