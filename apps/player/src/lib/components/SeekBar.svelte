<script lang="ts">
	// The seek bar redraws on every animation frame, so it does no layout work
	// per frame: the fill and thumb move by transform, and the bar is measured
	// only when a drag starts. (bits-ui's Slider re-measured its thumbs on every
	// value change, which cost ~200 ms a frame on a Blu-ray and made the picture
	// stutter.)
	let {
		value,
		max,
		loaded = null,
		disabled = false,
		indeterminate = false,
		step = 5,
		onscrub,
		oncommit,
		'aria-label': ariaLabel = 'Seek'
	}: {
		value: number;
		max: number;
		/** 0..1: how far ahead the file has been read. */
		loaded?: number | null;
		disabled?: boolean;
		/** Playing, but with no length or position to show (a looping chiptune): a moving sheen, no thumb. */
		indeterminate?: boolean;
		/** Seconds an arrow key moves. */
		step?: number;
		/** While dragging: where the pointer is. */
		onscrub?: (v: number) => void;
		/** On release, or on a key: where to seek. */
		oncommit?: (v: number) => void;
		'aria-label'?: string;
	} = $props();

	let bar: HTMLDivElement;
	let rect: DOMRect | null = null;
	let dragging = $state(false);

	const frac = $derived(max > 0 ? Math.max(0, Math.min(1, value / max)) : 0);
	const at = (x: number) => (rect ? Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * max : 0);

	function down(e: PointerEvent) {
		if (disabled || e.button !== 0) return;
		rect = bar.getBoundingClientRect();
		bar.setPointerCapture(e.pointerId);
		dragging = true;
		onscrub?.(at(e.clientX));
	}
	function move(e: PointerEvent) {
		if (dragging) onscrub?.(at(e.clientX));
	}
	function up(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		oncommit?.(at(e.clientX));
		rect = null;
	}
	function key(e: KeyboardEvent) {
		if (disabled) return;
		const d = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key];
		const to = e.key === 'Home' ? 0 : e.key === 'End' ? max : d != null ? value + d : null;
		if (to == null) return;
		e.preventDefault();
		oncommit?.(Math.max(0, Math.min(max, to)));
	}
</script>

<div
	bind:this={bar}
	role="slider"
	tabindex={disabled ? -1 : 0}
	aria-label={ariaLabel}
	aria-valuemin={0}
	aria-valuemax={Math.round(max)}
	aria-valuenow={Math.round(value)}
	aria-disabled={disabled}
	class="group relative flex h-5 w-full cursor-pointer touch-none items-center select-none outline-none aria-disabled:cursor-default aria-disabled:opacity-50"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	onkeydown={key}
>
	<div class="relative h-1 w-full overflow-hidden rounded-full bg-white/15 transition-[height] group-hover:h-1.5">
		{#if loaded != null}
			<div
				class="absolute inset-0 origin-left bg-white/30 transition-transform duration-500"
				style="transform: scaleX({Math.max(0, Math.min(1, loaded))})"
			></div>
		{/if}
		{#if indeterminate}
			<div class="sheen bg-primary/70 absolute inset-y-0 w-1/4 rounded-full"></div>
		{:else}
			<div class="bg-primary absolute inset-0 origin-left will-change-transform" style="transform: scaleX({frac})"></div>
		{/if}
	</div>
	{#if !indeterminate}
	<!-- The thumb spans the bar's width and translates by a percentage of it, so
	     its position needs no measurement either. -->
	<div class="pointer-events-none absolute inset-x-0 top-1/2 will-change-transform" style="transform: translateX({frac * 100}%)">
		<div
			class="size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-white shadow transition-[box-shadow,scale] group-hover:scale-110 group-focus-visible:ring-3 group-focus-visible:ring-white/50 {dragging
				? 'ring-3 ring-white/50'
				: ''}"
		></div>
	</div>
	{/if}
</div>

<style>
	.sheen {
		animation: sheen 2.4s ease-in-out infinite;
	}
	@keyframes sheen {
		from { transform: translateX(-100%); }
		to { transform: translateX(400%); }
	}
	@media (prefers-reduced-motion: reduce) {
		.sheen { animation: none; width: 100%; opacity: 0.4; }
	}
</style>
