<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { SAMPLES, MENU, thumbOf, type Sample } from '$lib/samples';
	import RiArrowDownSLine from 'remixicon-svelte/icons/arrow-down-s-line';
	import RiMusic2Line from 'remixicon-svelte/icons/music-2-line';

	/** A dropdown of bundled sample files, each marked with the browsers that cannot play it. */
	let {
		onpick,
		disabled = false,
		loading = null,
		variant = 'outline',
		label = 'sample'
	}: {
		onpick: (s: Sample) => void;
		disabled?: boolean;
		loading?: string | null;
		variant?: 'outline' | 'secondary' | 'ghost';
		label?: string;
	} = $props();

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
	<DropdownMenu.Content align="center" class="max-h-[min(70vh,600px)] w-[min(320px,calc(100vw-2rem))] overflow-y-auto p-1.5">
		{#each MENU.map((id) => SAMPLES.find((x) => x.id === id)!) as s (s.id)}
			{@const thumb = thumbOf(s)}
			<DropdownMenu.Item onSelect={() => onpick(s)} class="items-center gap-3 rounded-lg p-2">
				<span class="bg-muted relative grid aspect-video w-14 shrink-0 place-items-center overflow-hidden rounded-md">
					{#if thumb}
						<img src={thumb} alt="" loading="lazy" class="size-full object-cover" />
					{:else}
						<RiMusic2Line class="text-muted-foreground size-4" />
					{/if}
				</span>
				<span class="min-w-0 flex-1 text-sm font-medium">{s.label}</span>
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
