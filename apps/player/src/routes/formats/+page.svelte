<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import { ROWS, bySection, count, type Cell, type Row } from '$lib/compat';
	import SuiteView from '$lib/components/SuiteView.svelte';
	import { SUITES } from '$lib/suites';
	import RiArrowLeftLine from 'remixicon-svelte/icons/arrow-left-line';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiSearchLine from 'remixicon-svelte/icons/search-line';

	type Kind = 'all' | 'video' | 'audio';
	let query = $state('');
	let kind = $state<Kind>('all');

	type Column = { label: string; pick: (r: Row) => Cell | boolean | null };
	const COLUMNS: Column[] = [
		{ label: 'libvlc-wasm', pick: (r) => r.libvlcWasm },
		{ label: 'VLC desktop', pick: (r) => r.nativeVlc },
		{ label: 'ffmpeg.wasm', pick: (r) => r.ffmpegWasm },
		{ label: 'vlc.js', pick: (r) => r.vlcjs },
		{ label: 'Chrome', pick: (r) => r.browsers.chromium },
		{ label: 'Safari', pick: (r) => r.browsers.webkit },
		{ label: 'Firefox', pick: (r) => r.browsers.firefox }
	];
	const SUMMARY: [string, { yes: number; tested: number }][] = COLUMNS.map((c) => [c.label, count(ROWS, c.pick)]);
	let suite = $state(SUITES[0]?.key ?? '');

	const rows = $derived(
		ROWS.filter((r) => (kind === 'all' ? true : kind === 'video' ? r.hasVideo : !r.hasVideo)).filter((r) => {
			const q = query.trim().toLowerCase();
			return !q || [r.short, r.name, r.plain, r.format, r.file].some((s) => s.toLowerCase().includes(q));
		})
	);
	const sections = $derived(bySection(rows));
	const verdict = (v: Cell | boolean | null) => (v == null ? 'untested' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v.verdict);
	const size = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
</script>

<svelte:head><title>Supported formats · libvlc-wasm</title></svelte:head>

{#snippet mark(v: Cell | boolean | null, label: string)}
	{@const k = verdict(v)}
	{@const text = { yes: 'plays', partial: 'partly (one of its streams)', no: 'does not play', untested: 'not tested' }[k]}
	<td
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

	<main class="mx-auto flex min-h-svh max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6">
		<header class="flex flex-col gap-4">
			<a href="/" class="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs">
				<RiArrowLeftLine class="size-3.5" /> Back to the player
			</a>
			<h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Supported formats</h1>
		</header>

		<section class="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-4 lg:grid-cols-7">
			{#each SUMMARY as [label, c], i (label)}
				<div class="bg-card flex flex-col gap-3 p-5">
					<div class="flex items-baseline gap-1.5">
						<span class="font-display text-4xl leading-none font-semibold tracking-tight tabular-nums {i === 0 ? 'text-primary' : ''}">{c.yes}</span>
						<span class="text-muted-foreground text-sm tabular-nums">of {c.tested}</span>
					</div>
					<div class="bg-muted h-1 overflow-hidden rounded-full">
						<div class="h-full rounded-full {i === 0 ? 'bg-primary' : 'bg-foreground/35'}" style="width: {(c.yes / c.tested) * 100}%"></div>
					</div>
					<p class="text-sm font-medium">{label}</p>
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
		</div>

		<div class="border-border bg-card overflow-x-auto rounded-2xl border">
			<table class="w-full min-w-[820px] text-sm">
				<thead class="text-muted-foreground text-left text-xs">
					<tr>
						<th class="px-4 py-3 font-medium">Format</th>
						{#each COLUMNS as c (c.label)}
							<th class="w-20 px-1 py-3 text-center font-medium">
								{c.label}
							</th>
						{/each}
						<th class="w-28 px-4 py-3 font-medium"></th>
					</tr>
				</thead>
				{#each sections as s (s.key)}
					<tbody>
						<tr class="border-border border-t">
							<th colspan={COLUMNS.length + 2} class="bg-muted/50 px-4 py-2.5 text-left">
								<span class="font-display text-sm font-semibold">{s.title}</span>
							</th>
						</tr>
						{#each s.rows as r (r.id)}
							<tr class="border-border hover:bg-muted/30 border-t">
								<td class="px-4 py-2.5">
									<a href={r.wiki} target="_blank" rel="noreferrer" class="hover:text-primary font-medium underline-offset-4 hover:underline">{r.short}</a>
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

		{#if SUITES.length}
			<section class="flex flex-col gap-4">
				<h2 class="font-display text-2xl font-semibold tracking-tight">Test suites</h2>
				<Tabs.Root bind:value={suite}>
					<Tabs.List class="h-auto flex-wrap">
						{#each SUITES as s (s.key)}<Tabs.Trigger value={s.key}>{s.title}</Tabs.Trigger>{/each}
					</Tabs.List>
					{#each SUITES as s (s.key)}
						<Tabs.Content value={s.key} class="pt-4"><SuiteView suite={s} {query} /></Tabs.Content>
					{/each}
				</Tabs.Root>
			</section>
		{/if}
	</main>
