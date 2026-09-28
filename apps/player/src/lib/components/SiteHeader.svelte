<!-- The header of the data pages: the name, back to the demo, and the page tabs. -->
<script lang="ts">
	import cone from '$lib/assets/cone.svg';
	import SiteTabs from './SiteTabs.svelte';
</script>

<header class="flex flex-wrap items-center gap-x-6 gap-y-3">
	<a href="/" class="flex max-w-xs min-w-0 items-center gap-3">
		<img src={cone} alt="" class="size-9 shrink-0" />
		<span class="font-display text-lg leading-tight font-semibold tracking-tight">libvlc-wasm</span>
	</a>
	<SiteTabs />
</header>
