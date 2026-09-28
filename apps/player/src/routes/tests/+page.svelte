<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import SuiteView from '$lib/components/SuiteView.svelte';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import { SUITES } from '$lib/suites';
	import RiArrowLeftSLine from 'remixicon-svelte/icons/arrow-left-s-line';
	import RiArrowRightSLine from 'remixicon-svelte/icons/arrow-right-s-line';

	// No suite is shown until one is picked: each is a long table.
	let suite = $state('');
	const index = $derived(SUITES.findIndex((s) => s.key === suite));
	const suiteTitle = $derived(SUITES[index]?.title);
	/** Steps through the suites, wrapping at either end; from none, forward starts at the first. */
	function step(d: 1 | -1) {
		const n = SUITES.length;
		suite = SUITES[index < 0 ? (d > 0 ? 0 : n - 1) : (index + d + n) % n].key;
	}
	const arrow = 'border-border bg-card hover:bg-muted grid size-9 shrink-0 place-items-center rounded-md border transition-colors';
</script>

<svelte:head><title>Test coverage · libvlc-wasm</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-[1400px] flex-col gap-8 px-4 py-4 sm:px-6">
	<SiteHeader />

	<section class="flex flex-col gap-4 {suite ? 'pb-16' : 'pb-[28rem]'}">
		<div class="flex items-center gap-2">
			<button type="button" class={arrow} onclick={() => step(-1)} aria-label="Previous test suite"><RiArrowLeftSLine class="size-5" /></button>
			<Select.Root type="single" bind:value={suite}>
				<Select.Trigger class="w-full sm:w-96" aria-label="Test suite">
					<span class="truncate {suiteTitle ? '' : 'text-muted-foreground'}">{suiteTitle ?? 'Choose a test suite'}</span>
				</Select.Trigger>
				<!-- Always below, every suite at once: the section leaves room for it. -->
				<Select.Content side="bottom" align="start" avoidCollisions={false} class="max-h-none">
					{#each SUITES as s (s.key)}
						<Select.Item value={s.key} label={s.title}><span class="truncate">{s.title}</span></Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<button type="button" class={arrow} onclick={() => step(1)} aria-label="Next test suite"><RiArrowRightSLine class="size-5" /></button>
		</div>
		{#each SUITES as s (s.key)}
			{#if s.key === suite}<SuiteView suite={s} />{/if}
		{/each}
	</section>
</main>
