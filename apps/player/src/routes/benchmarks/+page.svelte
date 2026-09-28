<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import { SPEED, SPEED_TOOLS, codecOf, PORTS, PORTS_MATRIX } from '$lib/benchmarks';
	import RiArrowLeftLine from 'remixicon-svelte/icons/arrow-left-line';

	let threads = $state('1');
	const rows = $derived(
		SPEED.results
			.map((r) => ({ codec: codecOf(r.clip), clip: r.clip, run: r.runs[threads] ?? {} }))
			.filter((r) => Object.keys(r.run).length)
	);
	const scaleMax = $derived(Math.max(1, ...rows.flatMap((r) => SPEED_TOOLS.map(([k]) => r.run[k]?.fps ?? 0))));
	const fmt = (n: number | undefined) => (n == null || !isFinite(n) ? '—' : n >= 100 ? Math.round(n).toString() : n.toFixed(1));


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
	</header>

	<section class="flex flex-col gap-4">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<div>
				<h2 class="font-display text-2xl font-semibold tracking-tight">Decode speed, fps <span class="text-muted-foreground text-base font-normal">(higher is better)</span></h2>
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

	<section class="flex flex-col gap-4">
		<h2 class="font-display text-2xl font-semibold tracking-tight">Other web VLC ports</h2>
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

</main>
