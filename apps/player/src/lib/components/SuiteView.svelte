<!--
  One test suite, measured with every tool (corpus/compat/fate.mjs and
  suite.mjs): per tool, how many of its files play; per folder, the same;
  a folder opens to its files, loaded on demand.
-->
<script lang="ts">
	export type Counts = { union: number } & Record<string, number>;
	export type Suite = {
		key: string;
		title: string;
		description: string;
		source?: string;
		overall: Counts;
		folders: Record<string, Counts>;
		files: () => Promise<FileRow[]>;
	};
	type FileRow = { path: string; folder: string; video: string | null; audio: string | null } & Record<string, unknown>;

	let { suite, query = '' }: { suite: Suite; query?: string } = $props();

	const TOOLS: [key: string, label: string][] = [
		['wasm', 'libvlc-wasm'],
		['vlc', 'VLC desktop'],
		['ffmpeg', 'FFmpeg'],
		['chromium', 'Chrome'],
		['webkit', 'Safari'],
		['firefox', 'Firefox']
	];
	const tools = $derived(TOOLS.filter(([k]) => typeof suite.overall[k] === 'number'));
	const folders = $derived(
		Object.entries(suite.folders)
			.filter(([, c]) => c.union > 0)
			.filter(([name]) => !query.trim() || name.toLowerCase().includes(query.trim().toLowerCase()))
	);

	let files = $state<FileRow[] | null>(null);
	let open = $state<string | null>(null);
	async function toggle(name: string) {
		open = open === name ? null : name;
		files ??= await suite.files();
	}
	const share = (n: number, of: number) => (of ? n / of : 0);
	const tone = (f: number) =>
		f >= 0.999 ? 'bg-emerald-500/35 dark:bg-emerald-500/30' : f > 0 ? 'bg-amber-500/30 dark:bg-amber-500/25' : 'bg-red-500/25 dark:bg-red-500/22';
</script>

<div class="flex flex-col gap-4">
	<p class="text-muted-foreground max-w-3xl text-sm">
		{suite.description}
		{#if suite.source}<a href={suite.source} target="_blank" rel="noreferrer" class="text-foreground underline decoration-foreground/30 underline-offset-2">Source</a>.{/if}
		Counted: the {suite.overall.union.toLocaleString()} files native FFmpeg or native VLC can play.
	</p>

	<div class="border-border bg-border grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-3 lg:grid-cols-6">
		{#each tools as [key, label], i (key)}
			<div class="bg-card flex flex-col gap-2 p-4">
				<span class="font-display text-2xl leading-none font-semibold tabular-nums {i === 0 ? 'text-primary' : ''}"
					>{Math.round(share(suite.overall[key], suite.overall.union) * 100)}%</span
				>
				<span class="text-muted-foreground text-xs tabular-nums">{suite.overall[key].toLocaleString()} of {suite.overall.union.toLocaleString()}</span>
				<span class="text-sm font-medium">{label}</span>
			</div>
		{/each}
	</div>

	<div class="border-border bg-card overflow-x-auto rounded-2xl border">
		<table class="w-full min-w-[760px] text-sm">
			<thead class="text-muted-foreground text-left text-xs">
				<tr>
					<th class="px-4 py-3 font-medium">Folder</th>
					<th class="w-16 px-2 py-3 text-right font-medium">Files</th>
					{#each tools as [key, label] (key)}<th class="w-24 px-1 py-3 text-center font-medium">{label}</th>{/each}
				</tr>
			</thead>
			<tbody>
				{#each folders as [name, c] (name)}
					<tr class="border-border hover:bg-muted/30 cursor-pointer border-t" onclick={() => toggle(name)}>
						<td class="px-4 py-2 font-mono text-xs">
							<button type="button" class="text-left" aria-expanded={open === name}>{open === name ? '▾' : '▸'} {name}</button>
						</td>
						<td class="text-muted-foreground px-2 py-2 text-right tabular-nums">{c.union}</td>
						{#each tools as [key] (key)}
							<td class="border-background border-x-2 px-1 py-2 text-center text-xs tabular-nums {tone(share(c[key], c.union))}">{c[key]}</td>
						{/each}
					</tr>
					{#if open === name}
						{#each (files ?? []).filter((f) => f.folder === name) as f (f.path)}
							<tr class="border-border bg-muted/20 border-t text-xs">
								<td class="truncate px-4 py-1.5 pl-8 font-mono" colspan="2">
									{f.path.split('/').slice(2).join('/') || f.path}
									<span class="text-muted-foreground ml-1">{[f.video, f.audio].filter(Boolean).join(' + ')}</span>
								</td>
								{#each tools as [key] (key)}
									<td class="border-background border-x-2 py-1.5 {f[key] ? 'bg-emerald-500/30' : 'bg-red-500/20'}" aria-label="{key}: {f[key] ? 'plays' : 'does not play'}"></td>
								{/each}
							</tr>
						{/each}
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
</div>
