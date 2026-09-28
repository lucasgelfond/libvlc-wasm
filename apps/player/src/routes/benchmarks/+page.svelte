<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import { SPEED, SPEED_TOOLS, codecOf } from '$lib/benchmarks';
	import RiArrowLeftLine from 'remixicon-svelte/icons/arrow-left-line';

	let threads = $state('1');
	// A click moves focus to the tab; the focus ring then flashed on every switch.
	const quietTab = 'focus-visible:ring-0 focus-visible:outline-none focus-visible:border-transparent transition-none';
	const rows = $derived(
		SPEED.results
			.map((r) => ({ codec: codecOf(r.clip), clip: r.clip, run: r.runs[threads] ?? {} }))
			.filter((r) => Object.keys(r.run).length)
	);
	// One scale for both thread counts, so switching moves the bars rather than rescaling them all.
	const scaleMax = Math.max(1, ...SPEED.results.flatMap((r) => Object.values(r.runs).flatMap((run) => SPEED_TOOLS.map(([k]) => run[k]?.fps ?? 0))));
	const fmt = (n: number | undefined) => (n == null || !isFinite(n) ? '—' : n >= 100 ? Math.round(n).toString() : n.toFixed(1));


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
					<Tabs.Trigger value="1" class={quietTab}>1 thread</Tabs.Trigger>
					<Tabs.Trigger value="4" class={quietTab}>4 threads</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		</div>
		<div class="border-border bg-card overflow-x-auto rounded-2xl border">
			<!-- Fixed layout: the columns must not resize when the numbers change with the thread count. -->
			<table class="w-full min-w-[820px] table-fixed text-sm">
				<thead class="text-muted-foreground text-left text-xs">
					<tr>
						<th class="w-40 px-4 py-3 font-medium">Codec</th>
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
												<div class="h-full rounded-full transition-[width] duration-300 {k.startsWith('libvlc') ? 'bg-primary' : 'bg-foreground/40'}" style="width: {(v / scaleMax) * 100}%"></div>
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


</main>
