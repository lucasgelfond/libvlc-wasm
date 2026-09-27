<script lang="ts">
	import type { Session } from '$lib/session.svelte';
	import RiCloseLine from 'remixicon-svelte/icons/close-line';

	/** Everything opened, as a plain list of names; the one playing is emphasised. */
	let { session }: { session: Session } = $props();
</script>

<ol class="flex flex-col text-sm">
	{#each session.playlist as item, i (item)}
		<li class="group flex items-center gap-1">
			<button
				type="button"
				onclick={() => session.play(i)}
				aria-current={i === session.current ? 'true' : undefined}
				class="min-w-0 flex-1 truncate py-1 text-left {i === session.current
					? 'text-foreground font-medium'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				{item.name}
			</button>
			<button
				type="button"
				onclick={() => session.remove(i)}
				class="text-muted-foreground hover:text-foreground grid size-6 place-items-center opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
				aria-label="Remove {item.name}"
			>
				<RiCloseLine class="size-3.5" />
			</button>
		</li>
	{/each}
</ol>
