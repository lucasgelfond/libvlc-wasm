<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { ROWS, bySection, count, type Cell, type Row } from '$lib/compat';
	import RiArrowLeftLine from 'remixicon-svelte/icons/arrow-left-line';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiSearchLine from 'remixicon-svelte/icons/search-line';

	type Kind = 'all' | 'video' | 'audio';
	let query = $state('');
	let kind = $state<Kind>('all');

	type Column = { label: string; hint: string; pick: (r: Row) => Cell | boolean | null };
	const COLUMNS: Column[] = [
		{ label: 'libvlc-wasm', hint: 'This project: VLC 4 in the page', pick: (r) => r.libvlcWasm },
		{ label: 'VLC desktop', hint: 'VLC 3.0.24 for macOS, the reference', pick: (r) => r.nativeVlc },
		{ label: 'ffmpeg.wasm', hint: 'Decodes, but only by converting the file before anything can be shown', pick: (r) => r.ffmpegWasm },
		{ label: 'vlc.js', hint: "The 2024 VideoLabs build of VLC for the web; measured on video files only", pick: (r) => r.vlcjs },
		{ label: 'Chrome', hint: 'Chrome on its own, with <video> or <audio>', pick: (r) => r.browsers.chromium },
		{ label: 'Safari', hint: 'Safari (WebKit) on its own', pick: (r) => r.browsers.webkit },
		{ label: 'Firefox', hint: 'Firefox on its own', pick: (r) => r.browsers.firefox }
	];
	const SUMMARY: [string, string, { yes: number; tested: number }][] = [
		['libvlc-wasm', 'plays in the page', count(ROWS, (r) => r.libvlcWasm)],
		['VLC desktop', 'the native app', count(ROWS, (r) => r.nativeVlc)],
		['ffmpeg.wasm', 'decodes, then must convert', count(ROWS, (r) => r.ffmpegWasm)],
		['vlc.js', 'video files only', count(ROWS, (r) => r.vlcjs)],
		[
			'A browser alone',
			'Chrome, Safari or Firefox',
			{ yes: ROWS.filter((r) => r.browsers.chromium || r.browsers.webkit || r.browsers.firefox).length, tested: ROWS.length }
		]
	];

	const rows = $derived(
		ROWS.filter((r) => (kind === 'all' ? true : kind === 'video' ? r.hasVideo : !r.hasVideo)).filter((r) => {
			const q = query.trim().toLowerCase();
			return !q || [r.short, r.name, r.plain, r.format, r.file].some((s) => s.toLowerCase().includes(q));
		})
	);
	const sections = $derived(bySection(rows));
	const verdict = (v: Cell | boolean | null) => (v == null ? 'untested' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v.verdict);
	const note = (v: Cell | boolean | null) => (v && typeof v === 'object' ? v.note : '');
	const size = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
</script>

<svelte:head><title>Supported formats · libvlc-wasm</title></svelte:head>

{#snippet mark(v: Cell | boolean | null, label: string)}
	{@const k = verdict(v)}
	{@const text = { yes: 'plays', partial: 'partly (one of its streams)', no: 'does not play', untested: 'not tested' }[k]}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<td
					{...props}
					class="border-background border-x-2 px-1 py-2.5 text-center {k === 'yes'
						? 'bg-emerald-500/35 dark:bg-emerald-500/30'
						: k === 'partial'
							? 'bg-amber-500/35 dark:bg-amber-500/30'
							: k === 'no'
								? 'bg-red-500/25 dark:bg-red-500/22'
								: ''}"
					aria-label="{label}: {text}"
				>
					{#if k === 'untested'}<span class="text-muted-foreground/40 text-xs">n/a</span>{/if}
				</td>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="block max-w-72">
			<span class="block font-medium">{label}: {text}</span>
			{#if note(v)}<span class="mt-0.5 block opacity-75">{note(v)}</span>{/if}
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Tooltip.Provider delayDuration={150}>
	<main class="mx-auto flex min-h-svh max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
		<header class="flex flex-col gap-4">
			<a href="/" class="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs">
				<RiArrowLeftLine class="size-3.5" /> Back to the player
			</a>
			<h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Supported formats</h1>
		</header>

		<section class="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-3 lg:grid-cols-5">
			{#each SUMMARY as [label, sub, c], i (label)}
				<div class="bg-card flex flex-col gap-3 p-5 {i === SUMMARY.length - 1 ? 'col-span-2 sm:col-span-1' : ''}">
					<div class="flex items-baseline gap-1.5">
						<span class="font-display text-4xl leading-none font-semibold tracking-tight tabular-nums {i === 0 ? 'text-primary' : ''}">{c.yes}</span>
						<span class="text-muted-foreground text-sm tabular-nums">of {c.tested}</span>
					</div>
					<div class="bg-muted h-1 overflow-hidden rounded-full">
						<div class="h-full rounded-full {i === 0 ? 'bg-primary' : 'bg-foreground/35'}" style="width: {(c.yes / c.tested) * 100}%"></div>
					</div>
					<div>
						<p class="text-sm font-medium">{label}</p>
						<p class="text-muted-foreground text-xs">{sub}</p>
					</div>
				</div>
			{/each}
		</section>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<div class="relative sm:w-80">
				<RiSearchLine class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
				<Input bind:value={query} placeholder="Search formats and codecs…" class="pl-8" aria-label="Search" />
			</div>
			<Tabs.Root bind:value={kind}>
				<Tabs.List>
					<Tabs.Trigger value="all">All</Tabs.Trigger>
					<Tabs.Trigger value="video">Video</Tabs.Trigger>
					<Tabs.Trigger value="audio">Audio only</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		</div>

		<div class="text-muted-foreground -mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
			<span class="inline-flex items-center gap-1.5"><span class="size-3 rounded-sm bg-emerald-500/60"></span>plays</span>
			<span class="inline-flex items-center gap-1.5"><span class="size-3 rounded-sm bg-amber-500/60"></span>partly (one of its streams)</span>
			<span class="inline-flex items-center gap-1.5"><span class="size-3 rounded-sm bg-red-500/50"></span>does not play</span>
			<span class="inline-flex items-center gap-1.5"><span class="text-muted-foreground/50">n/a</span>not tested</span>
			<span class="sm:ml-auto">Hover any cell for what was measured</span>
		</div>

		<div class="border-border bg-card overflow-x-auto rounded-2xl border">
			<table class="w-full min-w-[820px] text-sm">
				<thead class="text-muted-foreground text-left text-xs">
					<tr>
						<th class="px-4 py-3 font-medium">Format</th>
						{#each COLUMNS as c (c.label)}
							<th class="w-20 px-1 py-3 text-center font-medium">
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}<span {...props} class="cursor-help">{c.label}</span>{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content class="max-w-60">{c.hint}</Tooltip.Content>
								</Tooltip.Root>
							</th>
						{/each}
						<th class="w-28 px-4 py-3 font-medium"></th>
					</tr>
				</thead>
				{#each sections as s (s.key)}
					<tbody>
						<tr class="border-border border-t">
							<th colspan={COLUMNS.length + 2} class="bg-muted/50 px-4 py-2.5 text-left">
								<Tooltip.Root>
									<Tooltip.Trigger>
										{#snippet child({ props })}
											<span {...props} class="font-display cursor-help text-sm font-semibold underline decoration-current/30 decoration-dotted underline-offset-4">{s.title}</span>
										{/snippet}
									</Tooltip.Trigger>
									<Tooltip.Content class="max-w-72">{s.blurb}</Tooltip.Content>
								</Tooltip.Root>
							</th>
						</tr>
						{#each s.rows as r (r.id)}
							<tr class="border-border hover:bg-muted/30 border-t">
								<td class="px-4 py-2.5">
									<Tooltip.Root>
										<Tooltip.Trigger>
											{#snippet child({ props })}
												<a {...props} href={r.wiki} target="_blank" rel="noreferrer" class="hover:text-primary font-medium underline-offset-4 hover:underline">{r.short}</a>
											{/snippet}
										</Tooltip.Trigger>
										<Tooltip.Content side="right" class="block max-w-72">
											<span class="block">{r.plain}</span>
											<span class="mt-1 block font-mono text-[10px] opacity-70">{r.format}</span>
										</Tooltip.Content>
									</Tooltip.Root>
								</td>
								{#each COLUMNS as c (c.label)}
									{@render mark(c.pick(r), c.label)}
								{/each}
								<td class="px-4 py-2.5">
									<a href={r.url} target="_blank" rel="noreferrer" class="group/sample text-primary inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
										<span class="underline-offset-2 group-hover/sample:underline">Sample</span>
										<span class="text-muted-foreground font-normal">({size(r.bytes)}&nbsp;<RiDownload2Line class="inline size-3.5 align-[-2px]" />)</span>
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				{/each}
			</table>
		</div>

	</main>
</Tooltip.Provider>
