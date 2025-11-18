<script lang="ts">
	import './app.postcss';

	import {
		Dropdown,
		DropdownDivider,
		DropdownItem,
		Gallery,
		Navbar,
		NavBrand,
		NavHamburger,
		NavLi,
		NavUl
	} from 'flowbite-svelte';
	import { ChevronDownOutline } from 'flowbite-svelte-icons';

	const images = [
		{ alt: 'erbology', src: './gallery/image.jpg' },
		{ alt: 'shoes', src: './gallery/image-1.jpg' },
		{ alt: 'small bag', src: './gallery/image-2.jpg' },
		{ alt: 'plants', src: './gallery/image-3.jpg' },
		{ alt: 'watch', src: './gallery/image-4.jpg' },
		{ alt: 'shoe', src: './gallery/image-5.jpg' }
	];
</script>

<Navbar>
	<NavBrand href="/">
		<img src="favicon.png" class="me-3 h-6 sm:h-9" alt="ESP32 Logo" />
		<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white"
			>SvelteESP32</span
		>
	</NavBrand>
	<NavHamburger />
	<NavUl>
		<NavLi href="/">Home</NavLi>
		<NavLi class="cursor-pointer">
			Dropdown<ChevronDownOutline class="w-6 h-6 ms-2 text-primary-800 dark:text-white inline" />
		</NavLi>
		<Dropdown simple class="w-44 z-20">
			<DropdownItem href="/">Dashboard</DropdownItem>
			<DropdownItem href="/docs/components/navbar">Settings</DropdownItem>
			<DropdownItem href="/">Earnings</DropdownItem>
			<DropdownDivider />
			<DropdownItem href="/">Sign out</DropdownItem>
		</Dropdown>
		<NavLi href="/settings">Setting</NavLi>
		<NavLi href="/pricing">Pricing</NavLi>
		<NavLi href="/contact">Contact</NavLi>
	</NavUl>
</Navbar>

<Gallery items={images} class="gap-4 grid-cols-2 md:grid-cols-3" />
