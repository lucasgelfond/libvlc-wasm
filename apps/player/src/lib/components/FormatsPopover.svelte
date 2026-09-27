<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import { ROWS, bySection, count, type Cell, type Row } from '$lib/compat';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';
	import RiCloseLine from 'remixicon-svelte/icons/close-line';
	import RiSubtractLine from 'remixicon-svelte/icons/subtract-line';
	import RiListCheck3 from 'remixicon-svelte/icons/list-check-3';
	import RiArrowRightLine from 'remixicon-svelte/icons/arrow-right-line';

	const sections = bySection(ROWS);
	const COLUMNS: [string, (r: Row) => Cell | boolean | null][] = [
		['libvlc-wasm', (r) => r.libvlcWasm],
		['VLC', (r) => r.nativeVlc],
		['Chrome', (r) => r.browsers.chromium],
		['Safari', (r) => r.browsers.webkit],
		['Firefox', (r) => r.browsers.firefox]
	];
	const verdict = (v: Cell | boolean | null) => (v == null ? 'untested' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v.verdict);
	const libvlc = count(ROWS, (r) => r.libvlcWasm);
</script>

{#snippet mark(v: Cell | boolean | null)}
	{@const k = verdict(v)}
	<span
		class="mx-auto grid size-5 place-items-center rounded-full {k === 'yes'
			? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
			: k === 'partial'
				? 'bg-amber-500/15 text-amber-600'
				: k === 'no'
					? 'bg-red-500/15 text-red-600 dark:text-red-400'
					: 'text-muted-foreground/50'}"
		aria-label={k}
	>
		{#if k === 'yes'}<RiCheckLine class="size-3.5" />{:else if k === 'no'}<RiCloseLine class="size-3.5" />{:else}<RiSubtractLine class="size-3.5" />{/if}
	</span>
{/snippet}

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm"><RiListCheck3 /> Supported formats</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-[min(560px,calc(100vw-2rem))] p-0">
		<Tooltip.Provider delayDuration={150}>
			<div class="border-border border-b p-4">
				<p class="text-sm font-semibold">What plays where</p>
				<p class="text-muted-foreground mt-1 text-xs">
					{libvlc.yes} of {libvlc.tested} hard formats from the test corpus play here. Hover a name for what it is; each links to a test file.
				</p>
			</div>
			<div class="max-h-[min(60vh,480px)] overflow-y-auto">
				<table class="w-full text-xs">
					<thead class="bg-popover text-muted-foreground sticky top-0 z-10">
						<tr>
							<th class="px-4 py-2 text-left font-medium">Format</th>
							{#each COLUMNS as [label] (label)}<th class="w-16 px-1 py-2 text-center font-medium">{label}</th>{/each}
						</tr>
					</thead>
					{#each sections as s (s.key)}
						<tbody>
							<tr><th colspan={COLUMNS.length + 1} class="bg-muted/40 px-4 py-1.5 text-left text-[11px] font-semibold">{s.title}</th></tr>
							{#each s.rows as r (r.id)}
								<tr class="border-border border-t">
									<td class="px-4 py-1.5">
										<Tooltip.Root>
											<Tooltip.Trigger>
												{#snippet child({ props })}
													<a {...props} href={r.url} target="_blank" rel="noreferrer" class="hover:text-primary underline-offset-2 hover:underline">{r.name}</a>
												{/snippet}
											</Tooltip.Trigger>
											<Tooltip.Content side="right" class="block max-w-64">
												<span class="block">{r.plain}</span>
												<span class="mt-1 block font-mono text-[10px] opacity-70">{r.format}</span>
											</Tooltip.Content>
										</Tooltip.Root>
									</td>
									{#each COLUMNS as [label, pick] (label)}<td class="px-1 py-1.5">{@render mark(pick(r))}</td>{/each}
								</tr>
							{/each}
						</tbody>
					{/each}
				</table>
			</div>
			<div class="border-border flex justify-end border-t p-2">
				<Button href="/formats" variant="ghost" size="sm">Full comparison, with ffmpeg.wasm and vlc.js <RiArrowRightLine /></Button>
			</div>
		</Tooltip.Provider>
	</Popover.Content>
</Popover.Root>
