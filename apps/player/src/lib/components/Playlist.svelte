<script lang="ts">
	import type { Session } from '$lib/session.svelte';
	import RiCloseLine from 'remixicon-svelte/icons/close-line';
	import RiMusic2Line from 'remixicon-svelte/icons/music-2-line';
	import RiDiscLine from 'remixicon-svelte/icons/disc-line';
	import RiFilmLine from 'remixicon-svelte/icons/film-line';

	let { session }: { session: Session } = $props();

	const codecs = (i: number) => {
		const info = session.playlist[i].info;
		if (!info) return session.playlist[i].disc ? 'DVD' : 'reading…';
		if ('error' in info) return 'unreadable';
		return info.tracks.map((t) => t.codec.trim()).join(' + ');
	};
</script>

<ol class="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
	{#each session.playlist as item, i (item)}
		<li class="group relative">
			<button
				type="button"
				onclick={() => session.play(i)}
				class="bg-card hover:border-primary/50 flex w-full flex-col gap-1.5 rounded-xl border-2 p-1.5 text-left transition-colors {i === session.current
					? 'border-primary'
					: 'border-transparent'}"
			>
				<span class="bg-muted text-muted-foreground grid aspect-video w-full place-items-center overflow-hidden rounded-lg">
					{#if item.thumb}
						<img src={item.thumb} alt="" class="size-full object-cover" />
					{:else if item.disc}
						<RiDiscLine class="size-6" />
					{:else if item.info && 'tracks' in item.info && !item.info.tracks.some((t) => t.type === 'video')}
						<RiMusic2Line class="size-6" />
					{:else}
						<RiFilmLine class="size-6 opacity-50" />
					{/if}
				</span>
				<span class="truncate px-1 text-xs font-medium">{item.name}</span>
				<span class="text-muted-foreground truncate px-1 pb-0.5 font-mono text-[10px]">{codecs(i)}</span>
			</button>
			<button
				type="button"
				onclick={() => session.remove(i)}
				class="bg-background/80 absolute top-2.5 right-2.5 grid size-6 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
				aria-label="Remove {item.name}"
			>
				<RiCloseLine class="size-3.5" />
			</button>
		</li>
	{/each}
</ol>
