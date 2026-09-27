<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { ROWS, MEASURED, bySection, count, type Cell, type Row } from '$lib/compat';
	import RiArrowLeftLine from 'remixicon-svelte/icons/arrow-left-line';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';
	import RiCloseLine from 'remixicon-svelte/icons/close-line';
	import RiSubtractLine from 'remixicon-svelte/icons/subtract-line';
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
			return !q || [r.name, r.plain, r.format, r.file].some((s) => s.toLowerCase().includes(q));
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
				<span
					{...props}
					class="mx-auto grid size-6 place-items-center rounded-full {k === 'yes'
						? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
						: k === 'partial'
							? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
							: k === 'no'
								? 'bg-red-500/15 text-red-600 dark:text-red-400'
								: 'text-muted-foreground/50'}"
					aria-label="{label}: {text}"
				>
					{#if k === 'yes'}<RiCheckLine class="size-4" />{:else if k === 'no'}<RiCloseLine class="size-4" />{:else}<RiSubtractLine class="size-4" />{/if}
				</span>
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
			<div>
				<h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Supported formats</h1>
				<p class="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed">
					{ROWS.length} hard files, from 90s CD-ROM video to Blu-ray audio, each decoded by every tool below. The ones where libvlc-wasm stands
					alone come first. Hover a name for what it is; every row links to its test file.
				</p>
			</div>
		</header>

		<section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
			{#each SUMMARY as [label, sub, c], i (label)}
				<div class="border-border rounded-2xl border p-4 {i === 0 ? 'border-primary/40 bg-primary/5' : 'bg-card'}">
					<p class="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">{label}</p>
					<p class="font-display mt-2 text-3xl font-semibold tabular-nums">{c.yes}<span class="text-muted-foreground text-base font-normal"> / {c.tested}</span></p>
					<p class="text-muted-foreground mt-1 text-xs">{sub}</p>
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
			<p class="text-muted-foreground font-mono text-[11px] sm:ml-auto">{rows.length} shown · measured {MEASURED}</p>
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
								<span class="font-display text-sm font-semibold">{s.title}</span>
								<span class="text-muted-foreground ml-2 text-xs font-normal">{s.rows.length} · {s.blurb}</span>
							</th>
						</tr>
						{#each s.rows as r (r.id)}
							<tr class="border-border hover:bg-muted/30 border-t">
								<td class="px-4 py-2.5">
									<Tooltip.Root>
										<Tooltip.Trigger>
											{#snippet child({ props })}<span {...props} class="cursor-help font-medium decoration-dotted underline-offset-4 hover:underline">{r.name}</span>{/snippet}
										</Tooltip.Trigger>
										<Tooltip.Content side="right" class="block max-w-72">
											<span class="block">{r.plain}</span>
											<span class="mt-1 block font-mono text-[10px] opacity-70">{r.format}</span>
										</Tooltip.Content>
									</Tooltip.Root>
								</td>
								{#each COLUMNS as c (c.label)}
									<td class="px-1 py-2.5 text-center">{@render mark(c.pick(r), c.label)}</td>
								{/each}
								<td class="px-4 py-2.5">
									<a href={r.url} target="_blank" rel="noreferrer" class="text-primary inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap hover:underline">
										<RiDownload2Line class="size-3.5" /> Test video
										<span class="text-muted-foreground font-normal">· {size(r.bytes)}</span>
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				{/each}
			</table>
		</div>

		<section class="border-border bg-card grid gap-2 rounded-2xl border p-5 text-sm sm:grid-cols-[auto_1fr] sm:gap-8">
			<h2 class="font-display text-lg font-semibold">And everything else</h2>
			<p class="text-muted-foreground leading-relaxed">
				These {ROWS.length} are a hard sample, not the whole list. The build carries FFmpeg's 500 decoders and 355 demuxers, plus VLC's own 44 demuxers
				and 40 decoders: DVD menus, libass subtitles, game-music emulators, trackers, MIDI with a SoundFont. MP4, WebM, MKV, MP3, FLAC and the other
				everyday formats play as a matter of course.
			</p>
		</section>

		<footer class="text-muted-foreground flex flex-col gap-1 pb-6 text-xs">
			<p>
				"Plays" means picture and sound were checked where the file has them. ffmpeg.wasm decodes but cannot play: it converts first, then hands the
				result to the browser. Several files are deliberately short or truncated test fixtures.
			</p>
		</footer>
	</main>
</Tooltip.Provider>
