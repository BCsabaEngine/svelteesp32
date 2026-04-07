/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module '*.postcss' {
	const content: string;
	export default content;
}
