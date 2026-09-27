<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import { ROWS, bySection, type Cell, type Row } from '$lib/compat';
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
</script>

{#snippet mark(v: Cell | boolean | null)}
	{@const k = verdict(v)}
	<td
		class="border-popover border-x-2 px-1 py-1.5 text-center {k === 'yes'
			? 'bg-emerald-500/35 dark:bg-emerald-500/30'
			: k === 'partial'
				? 'bg-amber-500/35 dark:bg-amber-500/30'
				: k === 'no'
					? 'bg-red-500/25 dark:bg-red-500/22'
					: ''}"
		aria-label={k}
	>
		{#if k === 'untested'}<span class="text-muted-foreground/40 text-[10px]">n/a</span>{/if}
	</td>
{/snippet}

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="outline" size="sm"><RiListCheck3 /> Supported formats</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-[min(560px,calc(100vw-2rem))] p-0">
		<Tooltip.Provider delayDuration={150}>
			<p class="border-border border-b px-4 py-3 text-sm font-semibold">What plays where</p>
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
													<a {...props} href={r.wiki} target="_blank" rel="noreferrer" class="hover:text-primary underline-offset-2 hover:underline">{r.short}</a>
												{/snippet}
											</Tooltip.Trigger>
											<Tooltip.Content side="top" align="start" class="block max-w-64">
												<span class="block">{r.plain}</span>
												<span class="mt-1 block font-mono text-[10px] opacity-70">{r.format}</span>
											</Tooltip.Content>
										</Tooltip.Root>
									</td>
									{#each COLUMNS as [label, pick] (label)}{@render mark(pick(r))}{/each}
								</tr>
							{/each}
						</tbody>
					{/each}
				</table>
			</div>
			<div class="border-border flex justify-end border-t p-2">
				<Button href="/formats" variant="ghost" size="sm">See full comparison, with other browser tools (ffmpeg.wasm / vlc.js) and sample files <RiArrowRightLine /></Button>
			</div>
		</Tooltip.Provider>
	</Popover.Content>
</Popover.Root>
