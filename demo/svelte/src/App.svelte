<script lang="ts">
	import './app.postcss';

	import { Badge, Button, Card, Navbar, NavBrand } from 'flowbite-svelte';
	import { onMount } from 'svelte';

	let uptime = $state(0);
	let ledState = $state(false);
	let error = $state('');
	let loading = $state(false);

	const images = [
		{ alt: 'ESP32 board', src: './gallery/esp32-1.webp' },
		{ alt: 'ESP32 setup', src: './gallery/esp32-2.jpg' },
		{ alt: 'ESP32 project', src: './gallery/esp32-3.webp' }
	];

	async function fetchStatus() {
		try {
			const result = await fetch('/api/status');
			const data = await result.json();
			uptime = data.uptime;
			ledState = data.led;
			error = '';
		} catch {
			error = 'Could not reach ESP32. Make sure the board is connected.';
		}
	}

	async function toggleLed() {
		loading = true;
		try {
			const result = await fetch('/api/toggle', { method: 'POST' });
			const data = await result.json();
			uptime = data.uptime;
			ledState = data.led;
			error = '';
		} catch {
			error = 'Could not reach ESP32. Make sure the board is connected.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchStatus();
	});
</script>

<Navbar>
	<NavBrand href="/">
		<img src="favicon.png" class="me-3 h-6 sm:h-9" alt="ESP32 Logo" />
		<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white"
			>SvelteESP32</span
		>
	</NavBrand>
</Navbar>

<div class="container mx-auto p-4 max-w-4xl">
	{#if error}
		<div
			class="mb-4 rounded-lg bg-yellow-50 p-4 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
		>
			{error}
		</div>
	{/if}

	<Card class="mb-6 p-4">
		<h5 class="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
			ESP32 Control
		</h5>
		<div class="flex items-center gap-4 mb-4">
			<span class="text-gray-700 dark:text-gray-300">Uptime:</span>
			<Badge color="blue">{uptime}s</Badge>
			<span class="text-gray-700 dark:text-gray-300">LED:</span>
			<Badge color={ledState ? 'green' : 'gray'}>{ledState ? 'ON' : 'OFF'}</Badge>
		</div>
		<Button onclick={toggleLed} disabled={loading}>
			{loading ? 'Toggling...' : 'Toggle LED'}
		</Button>
	</Card>

	<h5 class="mb-4 text-xl font-bold text-gray-900 dark:text-white">Gallery (for demo only)</h5>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
		{#each images as image (image.src)}
			<img src={image.src} alt={image.alt} class="h-auto max-w-full rounded-lg" />
		{/each}
	</div>
</div>
