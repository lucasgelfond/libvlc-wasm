<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { SAMPLES, thumbOf, type Sample } from '$lib/samples';
	import { ROWS } from '$lib/compat';
	import RiArrowDownSLine from 'remixicon-svelte/icons/arrow-down-s-line';
	import RiMusic2Line from 'remixicon-svelte/icons/music-2-line';
	import RiCloseLine from 'remixicon-svelte/icons/close-line';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';

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

	// The generated DVD image is not a corpus file; no browser opens a disc image.
	const browsers = (s: Sample) => {
		const r = ROWS.find((x) => x.file === s.files[0]);
		return [
			['Chrome', r?.browsers.chromium ?? false],
			['Safari', r?.browsers.webkit ?? false],
			['Firefox', r?.browsers.firefox ?? false]
		] as const;
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
	<DropdownMenu.Content align="center" class="w-[min(420px,calc(100vw-2rem))] p-1.5">
		<DropdownMenu.Label class="text-muted-foreground px-2 pt-1 pb-2 text-xs font-normal">Files browsers can't play on their own</DropdownMenu.Label>
		{#each SAMPLES as s (s.id)}
			{@const thumb = thumbOf(s)}
			<DropdownMenu.Item onSelect={() => onpick(s)} class="items-start gap-3 rounded-lg p-2">
				<span class="bg-muted relative mt-0.5 grid aspect-video w-16 shrink-0 place-items-center overflow-hidden rounded-md">
					{#if thumb}
						<img src={thumb} alt="" loading="lazy" class="size-full object-cover" />
					{:else}
						<RiMusic2Line class="text-muted-foreground size-4" />
					{/if}
				</span>
				<span class="flex min-w-0 flex-1 flex-col gap-1">
					<span class="text-sm leading-tight font-medium">{s.title}</span>
					<span class="text-muted-foreground truncate font-mono text-[10px]">{s.format}</span>
					<span class="flex gap-1">
						{#each browsers(s) as [name, ok] (name)}
							<span
								class="inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium {ok
									? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
									: 'bg-red-500/15 text-red-600 dark:text-red-400'}"
								title="{name} {ok ? 'plays it' : "can't play it"}"
							>
								{#if ok}<RiCheckLine class="size-3" />{:else}<RiCloseLine class="size-3" />{/if}{name}
							</span>
						{/each}
					</span>
				</span>
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
