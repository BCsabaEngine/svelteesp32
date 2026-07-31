import path from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [svelte(), tailwindcss()],
	build: {
		target: 'esnext',
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
			$components: path.resolve(import.meta.dirname, './src/components'),
			$lib: path.resolve(import.meta.dirname, './src/lib'),
			$stores: path.resolve(import.meta.dirname, './src/stores'),
			$types: path.resolve(import.meta.dirname, './src/types')
		}
	}
});
