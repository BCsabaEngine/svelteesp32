<script lang="ts">
	import './app.postcss';

	import { Button, ButtonGroup } from 'flowbite-svelte';
	import { onMount } from 'svelte';

	onMount(() => {});
</script>

<ButtonGroup class="text-right">
	<Button>Profile</Button>
	<Button>Settings</Button>
	<Button>Messages</Button>
</ButtonGroup>
