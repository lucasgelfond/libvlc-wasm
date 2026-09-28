<!--
  How many files each tool plays, as columns: the share above each column,
  the count under its label. The first column is libvlc-wasm, in the accent colour.
-->
<script lang="ts">
	let { items, label = 'Files each tool plays' }: { items: { label: string; yes: number; total: number }[]; label?: string } = $props();
	const share = (i: { yes: number; total: number }) => (i.total ? i.yes / i.total : 0);
</script>

<section class="bg-card border-border rounded-2xl border px-4 pt-5 pb-4 sm:px-5" aria-label={label}>
	<!-- Columns are scaled to the full height; each share sits just above its column. -->
	<div class="flex h-40 items-end gap-2 pt-6 sm:gap-5">
		{#each items as item, i (item.label)}
			<div class="flex h-full min-w-0 flex-1 items-end">
				<div class="relative w-full rounded-t-md {i === 0 ? 'bg-primary' : 'bg-foreground/25'}" style="height: {share(item) * 100}%">
					<span class="absolute inset-x-0 -top-6 text-center text-sm font-semibold tabular-nums {i === 0 ? 'text-primary' : ''}"
						>{Math.round(share(item) * 100)}%</span
					>
				</div>
			</div>
		{/each}
	</div>
	<div class="border-border flex gap-2 border-t pt-2 sm:gap-5">
		{#each items as item, i (item.label)}
			<div class="min-w-0 flex-1 text-center">
				<p class="truncate text-xs {i === 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}">{item.label}</p>
				<p class="text-muted-foreground/70 truncate text-[11px] tabular-nums">{item.yes.toLocaleString()} of {item.total.toLocaleString()}</p>
			</div>
		{/each}
	</div>
</section>
