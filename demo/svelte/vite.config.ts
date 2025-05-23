/* eslint-disable unicorn/prefer-module */
/* eslint-disable unicorn/prefer-node-protocol */
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [svelte(), tailwindcss()],
	build: {
		target: 'modules',
		sourcemap: false,
		minify: true,
		cssMinify: true,
		copyPublicDir: true,
		emptyOutDir: true,
		outDir: 'dist',
		chunkSizeWarningLimit: 1500,
		assetsInlineLimit: 0
	},
	base: '',
	resolve: {
		alias: {
			$components: path.resolve(__dirname, './src/components'),
			$lib: path.resolve(__dirname, './src/lib'),
			$stores: path.resolve(__dirname, './src/stores'),
			$types: path.resolve(__dirname, './src/types')
		}
	}
});
