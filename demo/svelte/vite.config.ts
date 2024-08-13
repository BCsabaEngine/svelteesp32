/* eslint-disable unicorn/prefer-module */
/* eslint-disable unicorn/prefer-node-protocol */
import swc from '@rollup/plugin-swc';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { defineConfig } from 'vite';
import { purgeCss } from 'vite-plugin-tailwind-purgecss';

export default defineConfig({
	plugins: [svelte()],
	build: {
		target: 'modules',
		sourcemap: false,
		minify: true,
		cssMinify: true,
		copyPublicDir: true,
		emptyOutDir: true,
		outDir: 'dist',
		chunkSizeWarningLimit: 1500,
		assetsInlineLimit: 0,
		rollupOptions: {
			plugins: [swc(), purgeCss()]
		}
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
