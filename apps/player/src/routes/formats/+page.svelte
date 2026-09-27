<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { ROWS, MEASURED, categoryName, count, type Cell, type Row } from '$lib/compat';
	import RiArrowLeftLine from 'remixicon-svelte/icons/arrow-left-line';
	import RiCheckLine from 'remixicon-svelte/icons/check-line';
	import RiCloseLine from 'remixicon-svelte/icons/close-line';
	import RiSubtractLine from 'remixicon-svelte/icons/subtract-line';
	import RiPlayLine from 'remixicon-svelte/icons/play-line';
	import RiDownload2Line from 'remixicon-svelte/icons/download-2-line';
	import RiExternalLinkLine from 'remixicon-svelte/icons/external-link-line';
	import RiSearchLine from 'remixicon-svelte/icons/search-line';

	type Kind = 'all' | 'video' | 'audio';
	let query = $state('');
	let kind = $state<Kind>('all');

	const TOOLS: { key: keyof Row; label: string; hint: string }[] = [
		{ key: 'libvlcWasm', label: 'libvlc-wasm', hint: 'This project: VLC 4 in the browser' },
		{ key: 'nativeVlc', label: 'VLC desktop', hint: 'VLC 3.0.24 for macOS, the reference' },
		{ key: 'ffmpegWasm', label: 'ffmpeg.wasm', hint: 'Decodes, but only by converting before anything can be shown' },
		{ key: 'vlcjs', label: 'vlc.js', hint: "addyosmani/vlc.js (VideoLabs' 2024 build); measured on video only" }
	];

	const rows = $derived(
		ROWS.filter((r) => (kind === 'all' ? true : kind === 'video' ? r.hasVideo : !r.hasVideo)).filter((r) => {
			const q = query.trim().toLowerCase();
			return !q || [r.name, r.plain, r.format, r.file, categoryName(r.category)].some((s) => s.toLowerCase().includes(q));
		})
	);
	const groups = $derived.by(() => {
		const m = new Map<string, Row[]>();
		for (const r of rows) m.set(r.category, [...(m.get(r.category) ?? []), r]);
		return [...m];
	});
	const browserCount = $derived(ROWS.filter((r) => r.browsers.chromium || r.browsers.webkit || r.browsers.firefox).length);
	const size = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
	const cell = (r: Row, k: keyof Row) => r[k] as Cell;
</script>

<svelte:head><title>What can it play? · VLC in the browser</title></svelte:head>

{#snippet verdict(c: Cell)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span
					{...props}
					class="inline-grid size-6 place-items-center rounded-full {c.verdict === 'yes'
						? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
						: c.verdict === 'partial'
							? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
							: c.verdict === 'no'
								? 'bg-red-500/10 text-red-600 dark:text-red-400'
								: 'text-muted-foreground/60'}"
					aria-label={c.verdict}
				>
					{#if c.verdict === 'yes'}<RiCheckLine class="size-4" />
					{:else if c.verdict === 'no'}<RiCloseLine class="size-4" />
					{:else}<RiSubtractLine class="size-4" />{/if}
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="max-w-72">
			{({ yes: 'Plays', partial: 'Partly (one of its streams)', no: 'Does not play', untested: 'Not tested' })[c.verdict]}{c.note
				? `: ${c.note}`
				: ''}
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Tooltip.Provider delayDuration={200}>
	<main class="mx-auto flex min-h-svh max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6">
		<header class="flex flex-col gap-3">
			<a href="/" class="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs">
				<RiArrowLeftLine class="size-3.5" /> Back to the player
			</a>
			<div>
				<h1 class="text-xl font-semibold tracking-tight">What can it play?</h1>
				<p class="text-muted-foreground mt-1 max-w-3xl text-sm text-balance">
					{ROWS.length} files from the test corpus: formats browsers can't play, from 90s CD-ROM video to Blu-ray audio.
					Each one was decoded by every tool below, and every file is here to try or download.
				</p>
			</div>
		</header>

		<section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			{#each TOOLS as t (t.key)}
				{@const c = count(ROWS, (r) => cell(r, t.key))}
				<div class="border-border rounded-xl border p-3 {t.key === 'libvlcWasm' ? 'border-primary/40 bg-primary/5' : ''}">
					<p class="text-muted-foreground text-xs">{t.label}</p>
					<p class="mt-1 text-2xl font-semibold tabular-nums">{c.yes}<span class="text-muted-foreground text-sm font-normal"> / {c.tested}</span></p>
					<p class="text-muted-foreground mt-1 text-[11px] leading-snug">{t.hint}</p>
				</div>
			{/each}
			<div class="border-border rounded-xl border p-3">
				<p class="text-muted-foreground text-xs">Native ffmpeg</p>
				<p class="mt-1 text-2xl font-semibold tabular-nums">
					{count(ROWS, (r) => r.ffmpeg).yes}<span class="text-muted-foreground text-sm font-normal"> / {ROWS.length}</span>
				</p>
				<p class="text-muted-foreground mt-1 text-[11px] leading-snug">Command-line FFmpeg, for reference</p>
			</div>
			<div class="border-border rounded-xl border p-3">
				<p class="text-muted-foreground text-xs">A browser on its own</p>
				<p class="mt-1 text-2xl font-semibold tabular-nums">{browserCount}<span class="text-muted-foreground text-sm font-normal"> / {ROWS.length}</span></p>
				<p class="text-muted-foreground mt-1 text-[11px] leading-snug">In any of Chrome, Safari or Firefox</p>
			</div>
		</section>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			<div class="relative sm:w-80">
				<RiSearchLine class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
				<Input bind:value={query} placeholder="Search formats, codecs, games…" class="pl-8" aria-label="Search" />
			</div>
			<Tabs.Root bind:value={kind}>
				<Tabs.List>
					<Tabs.Trigger value="all">All</Tabs.Trigger>
					<Tabs.Trigger value="video">Video</Tabs.Trigger>
					<Tabs.Trigger value="audio">Audio only</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
			<p class="text-muted-foreground text-xs sm:ml-auto">{rows.length} shown · measured {MEASURED}</p>
		</div>

		<div class="border-border overflow-x-auto rounded-xl border">
			<table class="w-full min-w-[860px] text-sm">
				<thead class="bg-muted/40 text-muted-foreground text-left text-xs">
					<tr>
						<th class="px-4 py-2.5 font-medium">File</th>
						{#each TOOLS as t (t.key)}
							<th class="w-24 px-2 py-2.5 text-center font-medium">{t.label}</th>
						{/each}
						<th class="w-24 px-2 py-2.5 text-center font-medium">Browsers</th>
						<th class="w-40 px-4 py-2.5 font-medium">Test file</th>
					</tr>
				</thead>
				{#each groups as [category, list] (category)}
					<tbody>
						<tr class="bg-muted/20 border-border border-t">
							<th colspan={TOOLS.length + 3} class="px-4 py-2 text-left text-xs font-semibold">
								{categoryName(category)} <span class="text-muted-foreground font-normal">· {list.length}</span>
							</th>
						</tr>
						{#each list as r (r.id)}
							<tr class="border-border hover:bg-muted/20 border-t align-top">
								<td class="px-4 py-3">
									<p class="font-medium">{r.name}</p>
									<p class="text-muted-foreground mt-0.5 max-w-md text-xs leading-relaxed">{r.plain}</p>
									<p class="text-muted-foreground/80 mt-1 font-mono text-[11px]">{r.format}</p>
								</td>
								{#each TOOLS as t (t.key)}
									<td class="px-2 py-3 text-center">{@render verdict(cell(r, t.key))}</td>
								{/each}
								<td class="px-2 py-3 text-center">
									<Tooltip.Root>
										<Tooltip.Trigger>
											{#snippet child({ props })}
												<span {...props} class="inline-flex gap-1 font-mono text-[11px]">
													{#each [['C', r.browsers.chromium, 'Chrome'], ['S', r.browsers.webkit, 'Safari'], ['F', r.browsers.firefox, 'Firefox']] as [l, ok, n] (n)}
														<span
															class="grid size-5 place-items-center rounded {ok ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground/50'}"
															aria-label="{n}: {ok ? 'plays' : 'no'}">{l}</span
														>
													{/each}
												</span>
											{/snippet}
										</Tooltip.Trigger>
										<Tooltip.Content class="max-w-72">{r.whyBrowserCant || 'Chrome, Safari, Firefox'}</Tooltip.Content>
									</Tooltip.Root>
								</td>
								<td class="px-4 py-3">
									<div class="flex flex-col gap-1 text-xs">
										<a href="/?try={encodeURIComponent(r.file)}" class="text-primary inline-flex items-center gap-1 font-medium hover:underline">
											<RiPlayLine class="size-3.5" /> Try it here
										</a>
										<a href="/media/{r.file}" download class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
											<RiDownload2Line class="size-3.5" /> Download · {size(r.bytes)}
										</a>
										<a href={r.url} target="_blank" rel="noreferrer" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
											<RiExternalLinkLine class="size-3.5" /> Original source
										</a>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				{/each}
			</table>
		</div>

		<footer class="text-muted-foreground flex flex-col gap-1 pb-4 text-xs">
			<p>
				"Plays" means picture and sound were checked where the file has them; hover any mark for what was measured. ffmpeg.wasm decodes files but
				cannot play them: it converts first, then hands the result to the browser. Several files are deliberately short or truncated test fixtures.
			</p>
			<p>Method: <code class="font-mono">corpus/compat/build.mjs</code> and <code class="font-mono">tests/verify-corpus.mjs</code> in the repository.</p>
		</footer>
	</main>
</Tooltip.Provider>
