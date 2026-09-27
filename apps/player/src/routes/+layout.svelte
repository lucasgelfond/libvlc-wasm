<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>libvlc-wasm</title>
</svelte:head>

<ModeWatcher defaultMode="system" />
<Toaster richColors position="top-center" />
{@render children()}
