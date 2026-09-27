<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import { SPEED, SPEED_TOOLS, codecOf, median, WASI, PACKAGES, PORTS, PORTS_MATRIX, PARITY } from '$lib/benchmarks';
	import RiArrowLeftLine from 'remixicon-svelte/icons/arrow-left-line';

	let threads = $state('1');
	const rows = $derived(
		SPEED.results
			.map((r) => ({ codec: codecOf(r.clip), clip: r.clip, run: r.runs[threads] ?? {} }))
			.filter((r) => Object.keys(r.run).length)
	);
	const scaleMax = $derived(Math.max(1, ...rows.flatMap((r) => SPEED_TOOLS.map(([k]) => r.run[k]?.fps ?? 0))));
	const fmt = (n: number | undefined) => (n == null || !isFinite(n) ? '—' : n >= 100 ? Math.round(n).toString() : n.toFixed(1));
	const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;
	const coldMs = median(SPEED.startup.cold.slice(1).map((x) => x.readyMs));
	const warmMs = median(SPEED.startup.warm.map((x) => x.readyMs));
	const s = SPEED.showdown;

	const wasiClips = WASI.clips.filter((c) => !c.short.includes('.'));
	const wasiRows = WASI.results.filter((r) => r.variant === 'base');

	const engines = PORTS_MATRIX?.engines ?? [];
	const portTotals = $derived(
		PORTS_MATRIX
			? PORTS_MATRIX.tools.map((t) => ({
					tool: t,
					byEngine: engines.map((e) => ({
						e,
						plays: PORTS_MATRIX!.samples.filter((x) => x.results[t.key]?.[e]?.plays).length,
						of: PORTS_MATRIX!.samples.length
					}))
				}))
			: []
	);
	const ENGINE: Record<string, string> = { chromium: 'Chrome', webkit: 'Safari', firefox: 'Firefox' };
</script>

<svelte:head><title>Benchmarks · libvlc-wasm</title></svelte:head>

<main class="mx-auto flex min-h-svh max-w-6xl flex-col gap-10 px-4 py-6 sm:px-6">
	<header class="flex flex-col gap-4">
		<a href="/" class="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-xs">
			<RiArrowLeftLine class="size-3.5" /> Back to the player
		</a>
		<h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Benchmarks</h1>
		<p class="text-muted-foreground text-sm">
			{SPEED.machine.cpu} ({SPEED.machine.cores} cores, {SPEED.machine.memGB} GB) · {SPEED.browser} · {SPEED.date.slice(0, 10)}. Every number is measured by
			the scripts in <code class="font-mono text-xs">bench/</code>; format support is on the <a href="/formats" class="text-foreground underline underline-offset-2">formats page</a>.
		</p>
	</header>

	<section class="flex flex-col gap-4">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 class="font-display text-2xl font-semibold tracking-tight">Decode speed</h2>
				<p class="text-muted-foreground max-w-3xl text-sm">
					5 s of 1080p30 per codec, frames per second (higher is better). The VLC columns run the whole player (demux, decode, copy, and in the
					browser the WebGL upload) at 32× with frame dropping off, so they top out near the player's pacing ceiling (~550 fps); the FFmpeg
					columns decode only. Native VLC is forced to software decoding.
				</p>
			</div>
			<Tabs.Root bind:value={threads}>
				<Tabs.List>
					<Tabs.Trigger value="1">1 thread</Tabs.Trigger>
					<Tabs.Trigger value="4">4 threads</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		</div>
		<div class="border-border bg-card overflow-x-auto rounded-2xl border">
			<table class="w-full min-w-[820px] text-sm">
				<thead class="text-muted-foreground text-left text-xs">
					<tr>
						<th class="px-4 py-3 font-medium">Codec</th>
						{#each SPEED_TOOLS as [k, label] (k)}<th class="px-3 py-3 font-medium">{label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.clip)}
						<tr class="border-border border-t">
							<td class="px-4 py-2.5 font-medium">{r.codec}</td>
							{#each SPEED_TOOLS as [k] (k)}
								{@const v = r.run[k]?.fps}
								<td class="px-3 py-2.5">
									{#if v}
										<div class="flex items-center gap-2">
											<div class="bg-muted h-1.5 w-20 overflow-hidden rounded-full">
												<div class="h-full rounded-full {k.startsWith('libvlc') ? 'bg-primary' : 'bg-foreground/40'}" style="width: {(v / scaleMax) * 100}%"></div>
											</div>
											<span class="tabular-nums">{fmt(v)}</span>
										</div>
									{:else}<span class="text-muted-foreground text-xs">{k === 'ffmpegWasm' && r.run[k] ? 'no decoder' : k === 'libvlcWebCodecs' ? 'no hardware decoder' : '—'}</span>{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="grid gap-4 sm:grid-cols-3">
		<div class="border-border bg-card flex flex-col gap-1 rounded-2xl border p-5">
			<span class="font-display text-3xl font-semibold tabular-nums">{Math.round(warmMs)} ms</span>
			<span class="text-sm font-medium">Startup</span>
			<span class="text-muted-foreground text-xs">createVLC() to ready, cached ({Math.round(coldMs)} ms uncached): worker, wasm compile, threads, libvlc_new</span>
		</div>
		<div class="border-border bg-card flex flex-col gap-1 rounded-2xl border p-5">
			<span class="font-display text-primary text-3xl font-semibold tabular-nums">{Math.round(s.vlcFirstFrameMs)} ms</span>
			<span class="text-sm font-medium">First frame of a RealVideo file</span>
			<span class="text-muted-foreground text-xs">
				ffmpeg.wasm has to convert it before a &lt;video&gt; can show it: {Math.round(s.ffmpegWasm_first10s_Ms)} ms for the first 10 s,
				{Math.round(s.ffmpegWasm_whole_Ms)} ms for the whole file
			</span>
		</div>
		<div class="border-border bg-card flex flex-col gap-1 rounded-2xl border p-5">
			{#each Object.entries(SPEED.size) as [name, z] (name)}
				<span class="text-sm"><span class="font-medium">{name}</span>: {mb(z.raw)} · {mb(z.gzip)} gzip · <span class="font-medium">{mb(z.brotli)} brotli</span></span>
			{/each}
			<span class="text-muted-foreground mt-1 text-xs">Download size of the engine, fetched once by the first createVLC() and cached.</span>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-display text-2xl font-semibold tracking-tight">Other web VLC ports</h2>
		<p class="text-muted-foreground max-w-3xl text-sm">
			Every "VLC in the browser" port there is, run on the same curated files as libvlc-wasm. They share a 2022–2024 VLC 4 snapshot without working
			build scripts; webvlc is a UI over the browser's own &lt;video&gt;.
		</p>
		{#if PORTS_MATRIX}
			<div class="border-border bg-card overflow-x-auto rounded-2xl border">
				<table class="w-full text-sm">
					<thead class="text-muted-foreground text-left text-xs">
						<tr><th class="px-4 py-3 font-medium">Tool</th>{#each engines as e (e)}<th class="px-3 py-3 font-medium">{ENGINE[e] ?? e}</th>{/each}</tr>
					</thead>
					<tbody>
						{#each portTotals as t (t.tool.key)}
							<tr class="border-border border-t">
								<td class="px-4 py-2.5">
									{#if t.tool.url}<a href={t.tool.url} target="_blank" rel="noreferrer" class="font-medium underline-offset-4 hover:underline">{t.tool.label}</a>{:else}<span class="font-medium">{t.tool.label}</span>{/if}
									{#if t.tool.notes}<span class="text-muted-foreground block text-xs">{t.tool.notes}</span>{/if}
								</td>
								{#each t.byEngine as c (c.e)}<td class="px-3 py-2.5 whitespace-nowrap tabular-nums">{c.plays} / {c.of}</td>{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="border-border bg-card overflow-x-auto rounded-2xl border">
				<table class="w-full text-sm">
					<thead class="text-muted-foreground text-left text-xs">
						<tr>
							<th class="px-4 py-3 font-medium">Port</th>
							<th class="px-3 py-3 font-medium">Video shown</th>
							<th class="px-3 py-3 font-medium">Audible</th>
							<th class="px-3 py-3 font-medium">Median first frame</th>
						</tr>
					</thead>
					<tbody>
						{#each PORTS as p (p.key)}
							<tr class="border-border border-t">
								<td class="px-4 py-2.5 font-medium">{p.port ?? p.key}{#if p.build}<span class="text-muted-foreground"> ({p.build})</span>{/if}</td>
								<td class="px-3 py-2.5 tabular-nums">{p.summary?.videoShown ?? '—'}</td>
								<td class="px-3 py-2.5 tabular-nums">{p.summary?.audible ?? '—'}</td>
								<td class="px-3 py-2.5 tabular-nums">{p.summary?.medianFirstFrameMs != null ? `${p.summary.medianFirstFrameMs} ms` : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="flex flex-col gap-4">
		<div>
			<h2 class="font-display text-2xl font-semibold tracking-tight">Parity with native VLC</h2>
			<p class="text-muted-foreground max-w-3xl text-sm">
				Files that play, per test suite. VLC 4 (native) is a macOS nightly of the same VLC master libvlc-wasm is built from; each suite counts the
				files native FFmpeg or native VLC 3 plays. Details per file are on the <a href="/formats#test-suites" class="text-foreground underline underline-offset-2">formats page</a>.
			</p>
		</div>
		<div class="border-border bg-card overflow-x-auto rounded-2xl border">
			<table class="w-full min-w-[720px] text-sm">
				<thead class="text-muted-foreground text-left text-xs">
					<tr>
						<th class="px-4 py-3 font-medium">Suite</th><th class="px-3 py-3 text-right font-medium">Files</th>
						<th class="px-3 py-3 text-right font-medium">libvlc-wasm</th><th class="px-3 py-3 text-right font-medium">VLC 4 (native)</th>
						<th class="px-3 py-3 text-right font-medium">VLC 3 (native)</th><th class="px-3 py-3 text-right font-medium">VLC 4 plays, libvlc-wasm not</th>
					</tr>
				</thead>
				<tbody>
					{#each PARITY as p (p.name)}
						<tr class="border-border border-t">
							<td class="px-4 py-2.5 font-medium">{p.title}</td>
							<td class="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{p.of}</td>
							<td class="text-primary px-3 py-2.5 text-right tabular-nums">{p.wasm}</td>
							<td class="px-3 py-2.5 text-right tabular-nums">{p.vlc4 ?? '—'}</td>
							<td class="px-3 py-2.5 text-right tabular-nums">{p.vlc3}</td>
							<td class="px-3 py-2.5 text-right tabular-nums">{p.vlc4NotWasm ?? '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-display text-2xl font-semibold tracking-tight">Other browser media packages</h2>
		<div class="border-border bg-card overflow-x-auto rounded-2xl border">
			<table class="w-full min-w-[900px] text-sm">
				<thead class="text-muted-foreground text-left text-xs">
					<tr>
						<th class="px-4 py-3 font-medium">Package</th><th class="px-3 py-3 font-medium">What it is</th>
						<th class="px-3 py-3 font-medium">Plays in a page</th><th class="px-3 py-3 font-medium">Formats</th>
						<th class="px-3 py-3 font-medium">Subtitles</th><th class="px-3 py-3 font-medium">Size</th>
					</tr>
				</thead>
				<tbody>
					{#each PACKAGES as p (p.name)}
						<tr class="border-border border-t align-top">
							<td class="px-4 py-2.5"><a href={p.url} target="_blank" rel="noreferrer" class="font-medium underline-offset-4 hover:underline">{p.name}</a>{#if p.version}<span class="text-muted-foreground"> {p.version}</span>{/if}</td>
							<td class="px-3 py-2.5">{p.what}</td><td class="px-3 py-2.5">{p.playsInPage}</td>
							<td class="px-3 py-2.5">{p.formats}</td><td class="px-3 py-2.5">{p.subtitles}</td><td class="px-3 py-2.5">{p.size}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<div>
			<h2 class="font-display text-2xl font-semibold tracking-tight">WebAssembly runtimes</h2>
			<p class="text-muted-foreground max-w-3xl text-sm">
				The same FFmpeg decoder C code, compiled to WASI and run on each runtime, in frames per second at 1080p (slowdown vs native in brackets).
				{WASI.meta.host}, {WASI.meta.date.slice(0, 10)}.
			</p>
		</div>
		<div class="border-border bg-card overflow-x-auto rounded-2xl border">
			<table class="w-full min-w-[820px] text-sm">
				<thead class="text-muted-foreground text-left text-xs">
					<tr><th class="px-4 py-3 font-medium">Runtime</th>{#each wasiClips as c (c.short)}<th class="px-3 py-3 font-medium">{codecOf(c.short)}</th>{/each}</tr>
				</thead>
				<tbody>
					{#each wasiRows as r (r.runtime)}
						<tr class="border-border border-t">
							<td class="px-4 py-2.5"><span class="font-medium">{r.runtime}</span><span class="text-muted-foreground block text-xs">{r.label}</span></td>
							{#each wasiClips as c (c.short)}
								{@const v = r.clips[c.short]}
								<td class="px-3 py-2.5 tabular-nums">{#if v}{fmt(v.median_fps)} <span class="text-muted-foreground text-xs">({v.slowdown.toFixed(1)}×)</span>{:else}—{/if}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</main>
