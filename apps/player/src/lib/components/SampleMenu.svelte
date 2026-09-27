<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { SAMPLES, thumbOf, type Sample } from '$lib/samples';
	import { ROWS } from '$lib/compat';
	import RiArrowDownSLine from 'remixicon-svelte/icons/arrow-down-s-line';
	import RiMusic2Line from 'remixicon-svelte/icons/music-2-line';

	/** A dropdown of bundled sample files, each marked with the browsers that cannot play it. */
	let {
		onpick,
		disabled = false,
		loading = null,
		variant = 'outline',
		label = 'Sample video'
	}: {
		onpick: (s: Sample) => void;
		disabled?: boolean;
		loading?: string | null;
		variant?: 'outline' | 'secondary' | 'ghost';
		label?: string;
	} = $props();

	// One line on which browsers play it on their own. The generated DVD image
	// is not a corpus file; no browser opens a disc image.
	const support = (s: Sample) => {
		const r = ROWS.find((x) => x.file === s.files[0]);
		const plays: [string, boolean | undefined][] = [
			['Chrome', r?.browsers.chromium],
			['Safari', r?.browsers.webkit],
			['Firefox', r?.browsers.firefox]
		];
		const ok = plays.filter(([, v]) => v).map(([n]) => n);
		return ok.length ? `Plays in ${ok.join(' and ')} only` : 'No browser plays it on its own';
	};
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger {disabled}>
		{#snippet child({ props })}
			<Button {...props} {variant} size="sm" onclick={(e: MouseEvent) => e.stopPropagation()}>
				{#if loading}<span class="border-muted-foreground/30 border-t-primary size-3.5 animate-spin rounded-full border-2"></span>{/if}
				{label}
				<RiArrowDownSLine class="opacity-60" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="center" class="max-h-[min(70vh,560px)] w-[min(420px,calc(100vw-2rem))] overflow-y-auto p-1.5">
		{#each SAMPLES as s (s.id)}
			{@const thumb = thumbOf(s)}
			<DropdownMenu.Item onSelect={() => onpick(s)} class="items-center gap-3 rounded-lg p-2">
				<span class="bg-muted relative grid aspect-video w-14 shrink-0 place-items-center overflow-hidden rounded-md">
					{#if thumb}
						<img src={thumb} alt="" loading="lazy" class="size-full object-cover" />
					{:else}
						<RiMusic2Line class="text-muted-foreground size-4" />
					{/if}
				</span>
				<span class="flex min-w-0 flex-1 flex-col gap-0.5">
					<span class="text-sm leading-tight font-medium">{s.label}</span>
					<span class="text-muted-foreground text-xs">{support(s)}</span>
				</span>
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
