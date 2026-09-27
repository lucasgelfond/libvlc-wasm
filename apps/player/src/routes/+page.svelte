<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import { Badge } from '$lib/components/ui/badge';
	import { Kbd } from '$lib/components/ui/kbd';
	import * as Popover from '$lib/components/ui/popover';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SettingsMenu from '$lib/components/SettingsMenu.svelte';
	import { Session, formatTime } from '$lib/session.svelte';
	import RiPlayFill from 'remixicon-svelte/icons/play-fill';
	import RiPauseFill from 'remixicon-svelte/icons/pause-fill';
	import RiReplay10Line from 'remixicon-svelte/icons/replay-10-line';
	import RiForward10Line from 'remixicon-svelte/icons/forward-10-line';
	import RiVolumeUpLine from 'remixicon-svelte/icons/volume-up-line';
	import RiVolumeDownLine from 'remixicon-svelte/icons/volume-down-line';
	import RiVolumeMuteLine from 'remixicon-svelte/icons/volume-mute-line';
	import RiFullscreenLine from 'remixicon-svelte/icons/fullscreen-line';
	import RiFullscreenExitLine from 'remixicon-svelte/icons/fullscreen-exit-line';
	import RiCamera3Line from 'remixicon-svelte/icons/camera-3-line';
	import RiFolderOpenLine from 'remixicon-svelte/icons/folder-open-line';
	import RiUploadCloud2Line from 'remixicon-svelte/icons/upload-cloud-2-line';
	import RiMusic2Line from 'remixicon-svelte/icons/music-2-line';
	import RiDiscLine from 'remixicon-svelte/icons/disc-line';
	import RiFolderVideoLine from 'remixicon-svelte/icons/folder-video-line';
	import RiReplayLine from 'remixicon-svelte/icons/restart-line';
	import { SAMPLES, loadSample, type Sample } from '$lib/samples';

	const session = new Session();
	let canvas: HTMLCanvasElement;
	let stage: HTMLDivElement;
	let fileInput: HTMLInputElement;
	let subInput: HTMLInputElement;
	let folderInput: HTMLInputElement;
	let loadingSample = $state<string | null>(null);
	let dragging = $state(false);
	let fullscreen = $state(false);
	let idle = $state(false);
	let scrub = $state<number | null>(null);
	let scrubbing = false;
	let idleTimer = 0;

	onMount(() => {
		if (import.meta.env.DEV) (window as unknown as { session: Session }).session = session;
		session.start(canvas).then(() => {
			// /?try=<corpus path>, from the formats page.
			const path = new URLSearchParams(location.search).get('try');
			if (!path || !session.ready) return;
			history.replaceState(null, '', '/');
			// VobSub is a pair of files drawn over a video.
			const files = /\.idx$/i.test(path) ? ['gen/t_mpeg2_ac3.ts', path, path.replace(/\.idx$/i, '.sub')] : [path];
			openSample({ files, title: path, plain: '', format: '' });
		});
		const onFs = () => (fullscreen = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onFs);
		return () => document.removeEventListener('fullscreenchange', onFs);
	});
	onDestroy(() => session.destroy());

	$effect(() => {
		if (session.error) toast.error(session.error);
	});

	const opened = $derived(!!session.name);
	let menuOpen = $state(false);
	let volumeOpen = $state(false);
	const showControls = $derived(!idle || !session.playing || scrub !== null || menuOpen || volumeOpen);
	// The stage takes the picture's shape (with its pixel aspect), so there are
	// no bars around it; audio gets a 16:9 card.
	const aspect = $derived.by(() => {
		const v = session.video.find((t) => t.selected) ?? session.video[0];
		if (!v?.width || !v?.height) return 16 / 9;
		const sar = v.sarNum && v.sarDen ? v.sarNum / v.sarDen : 1;
		return (v.width * sar) / v.height;
	});
	const codecs = $derived([
		...new Set(
			session.tracks
				.filter((t) => t.type !== 'text')
				.map((t) => (t.codecName ?? t.codec).replace(/\s*\(.*\)$/, ''))
		)
	]);
	const video = $derived(session.video.find((t) => t.selected) ?? session.video[0]);
	const iconButton = 'text-white hover:bg-white/15 hover:text-white';

	async function openSample(s: Sample) {
		loadingSample = s.title;
		try {
			await openFiles(await loadSample(s));
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			loadingSample = null;
		}
	}

	/** Files from a drop, walking into dropped folders (a VIDEO_TS folder, say). */
	async function droppedFiles(dt: DataTransfer): Promise<File[]> {
		const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[];
		if (!entries.some((e) => e.isDirectory)) return [...dt.files];
		const out: File[] = [];
		const walk = async (e: FileSystemEntry): Promise<void> => {
			if (e.isFile) {
				out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)));
			} else if (e.isDirectory) {
				const reader = (e as FileSystemDirectoryEntry).createReader();
				// readEntries returns the listing in batches until an empty one.
				for (;;) {
					const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
					if (!batch.length) break;
					for (const c of batch) await walk(c);
				}
			}
		};
		for (const e of entries) await walk(e);
		return out;
	}

	async function openFiles(list: FileList | File[] | null | undefined) {
		const files = [...(list ?? [])];
		if (!files.length) return;
		try {
			await session.open(files);
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	function poke() {
		idle = false;
		clearTimeout(idleTimer);
		idleTimer = window.setTimeout(() => (idle = true), 2500);
	}

	function toggleFullscreen() {
		if (document.fullscreenElement) document.exitFullscreen();
		else stage.requestFullscreen?.();
	}

	function onKey(e: KeyboardEvent) {
		session.unlockAudio();
		if (!opened || (e.target as HTMLElement).closest('input, [role=menu], [role=slider]')) return;
		const k = e.key;
		// On a disc menu the arrows and Enter move between its buttons.
		const nav = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'activate', ' ': 'activate' } as const;
		if (session.inMenu && k in nav) {
			session.navigate(nav[k as keyof typeof nav]);
			e.preventDefault();
			return;
		}
		if (k === ' ' || k === 'k') session.toggle();
		else if (k === 'ArrowRight' || k === 'l') session.skip(k === 'l' ? 10 : 5);
		else if (k === 'ArrowLeft' || k === 'j') session.skip(k === 'j' ? -10 : -5);
		else if (k === 'ArrowUp') session.setVolume(Math.min(2, session.volume + 0.05));
		else if (k === 'ArrowDown') session.setVolume(Math.max(0, session.volume - 0.05));
		else if (k === 'm') session.toggleMute();
		else if (k === 'f') toggleFullscreen();
		else if (k === '.') session.player?.nextFrame();
		else if (k === '>') session.setRate(Math.min(4, +(session.rate + 0.25).toFixed(2)));
		else if (k === '<') session.setRate(Math.max(0.25, +(session.rate - 0.25).toFixed(2)));
		else return;
		e.preventDefault();
		poke();
	}
</script>

<svelte:window
	onkeydown={onKey}
	onpointerdown={() => session.unlockAudio()}
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={(e) => {
		if (!e.relatedTarget) dragging = false;
	}}
	ondrop={(e) => {
		e.preventDefault();
		dragging = false;
		if (e.dataTransfer) droppedFiles(e.dataTransfer).then(openFiles, (err) => toast.error(err.message));
	}}
/>

<input bind:this={fileInput} type="file" multiple class="hidden" onchange={(e) => openFiles(e.currentTarget.files)} />
<input
	bind:this={folderInput}
	type="file"
	webkitdirectory
	class="hidden"
	onchange={(e) => openFiles(e.currentTarget.files)}
/>
<input
	bind:this={subInput}
	type="file"
	multiple
	class="hidden"
	onchange={(e) => session.addSubtitles([...(e.currentTarget.files ?? [])])}
/>

<Tooltip.Provider delayDuration={400}>
	<main class="mx-auto flex min-h-svh max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6">
		<header class="flex items-center gap-3">
			<div class="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg">
				<svg viewBox="0 0 24 24" class="size-4" aria-hidden="true"><path fill="currentColor" d="M12 2 3.5 20.5h17z" /></svg>
			</div>
			<div class="min-w-0 flex-1">
				<h1 class="truncate text-sm font-semibold">{opened ? session.name : 'VLC in the browser'}</h1>
				<p class="text-muted-foreground truncate text-xs">
					{#if opened && codecs.length}
						{codecs.join(' · ')}{#if video?.width}&nbsp;· {video.width}×{video.height}{/if}
					{:else}
						{session.engine || 'Loading VLC…'}
					{/if}
				</p>
			</div>
			{#if opened}
				<Button variant="outline" size="sm" onclick={() => fileInput.click()}><RiFolderOpenLine /> Open</Button>
			{/if}
		</header>

		<div
			bind:this={stage}
			role="region"
			aria-label="Player"
			class="relative mx-auto w-full overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-black/10 {opened
				? ''
				: 'hidden'} {idle && session.playing ? 'cursor-none' : ''}"
			style={fullscreen ? '' : `aspect-ratio: ${aspect}; max-width: calc((100svh - 150px) * ${aspect})`}
			onpointermove={poke}
			onpointerleave={() => (idle = true)}
		>
			<canvas
				bind:this={canvas}
				class="absolute inset-0 size-full"
				onclick={() => !session.inMenu && session.toggle()}
				ondblclick={() => !session.inMenu && toggleFullscreen()}
			></canvas>

			{#if opened && session.tracks.length && !session.hasVideo}
				<div class="pointer-events-none absolute inset-0 grid place-items-center">
					<div class="flex flex-col items-center gap-4 text-white/80">
						<div
							class="grid size-24 place-items-center rounded-full bg-white/10 transition-transform duration-100"
							style="transform: scale({1 + Math.min(session.level, 1) * 0.18})"
						>
							<RiMusic2Line class="size-10" />
						</div>
						<p class="max-w-md truncate px-6 text-sm">{session.name}</p>
					</div>
				</div>
			{/if}

			{#if session.ended}
				<div class="absolute inset-0 grid place-items-center bg-black/50">
					<div class="flex flex-col items-center gap-3 text-center text-white">
						<p class="text-sm font-medium">
							{session.duration && session.time < session.duration * 0.95 ? 'The file ends here' : 'Finished'}
						</p>
						{#if session.duration && session.time < session.duration * 0.95}
							<p class="max-w-xs text-xs text-white/70">
								Its header claims {formatTime(session.duration)}, but the data stops at {formatTime(session.time)} (a truncated file).
							</p>
						{/if}
						<Button variant="secondary" size="sm" onclick={() => session.toggle()}><RiReplayLine /> Play again</Button>
					</div>
				</div>
			{/if}

			{#if session.state === 'opening'}
				<div class="pointer-events-none absolute inset-0 grid place-items-center">
					<div class="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
				</div>
			{/if}

			<div
				class="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-10 pb-2 text-white transition-opacity duration-300 {showControls
					? ''
					: 'pointer-events-none opacity-0'}"
			>
				<!-- The slider also reports programmatic value changes, so only a
				     pointer or key actually on it counts as scrubbing. -->
				<div
					role="presentation"
					onpointerdowncapture={() => (scrubbing = true)}
					onkeydowncapture={() => (scrubbing = true)}
				>
					<Slider
						type="single"
						min={0}
						max={session.duration || 1}
						step={0.1}
						value={scrub ?? session.time}
						onValueChange={(v) => {
							if (scrubbing) scrub = v;
						}}
						onValueCommit={async (v) => {
							if (!scrubbing) return;
							scrubbing = false;
							await session.seek(v);
							scrub = null;
						}}
						disabled={!session.duration}
						class="py-2 **:data-[slot=slider-track]:bg-white/25"
						aria-label="Seek"
					/>
				</div>
				<div class="flex items-center gap-1">
					<Button variant="ghost" size="icon" class={iconButton} onclick={() => session.toggle()} aria-label={session.playing ? 'Pause' : 'Play'}>
						{#if session.playing}<RiPauseFill class="size-5" />{:else}<RiPlayFill class="size-5" />{/if}
					</Button>
					<Button variant="ghost" size="icon" class={iconButton} onclick={() => session.skip(-10)} aria-label="Back 10 seconds">
						<RiReplay10Line class="size-5" />
					</Button>
					<Button variant="ghost" size="icon" class={iconButton} onclick={() => session.skip(10)} aria-label="Forward 10 seconds">
						<RiForward10Line class="size-5" />
					</Button>

					<Popover.Root bind:open={volumeOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="ghost" size="icon" class={iconButton} aria-label="Volume">
									{#if session.muted || session.volume === 0}<RiVolumeMuteLine class="size-5" />
									{:else if session.volume < 0.5}<RiVolumeDownLine class="size-5" />
									{:else}<RiVolumeUpLine class="size-5" />{/if}
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content side="top" class="w-60">
							<div class="flex items-center gap-3">
								<Button variant="ghost" size="icon-sm" onclick={() => session.toggleMute()} aria-label="Mute">
									{#if session.muted}<RiVolumeMuteLine />{:else}<RiVolumeUpLine />{/if}
								</Button>
								<Slider
									type="single"
									min={0}
									max={2}
									step={0.01}
									value={session.muted ? 0 : session.volume}
									onValueChange={(v) => session.setVolume(v)}
									aria-label="Volume"
								/>
								<span class="text-muted-foreground w-10 text-right text-xs tabular-nums">
									{Math.round((session.muted ? 0 : session.volume) * 100)}%
								</span>
							</div>
						</Popover.Content>
					</Popover.Root>

					<span class="ml-1 text-xs text-white/85 tabular-nums">
						{formatTime(scrub ?? session.time)} <span class="text-white/50">/ {formatTime(session.duration)}</span>
					</span>
					{#if session.rate !== 1}<Badge variant="secondary" class="ml-1 h-5 px-1.5 text-[10px]">{session.rate}×</Badge>{/if}

					<div class="ml-auto flex items-center gap-1">
						{#if session.hasVideo}
							<Tooltip.Root>
								<Tooltip.Trigger>
									{#snippet child({ props })}
										<Button {...props} variant="ghost" size="icon" class={iconButton} onclick={() => session.snapshot()} aria-label="Save frame">
											<RiCamera3Line class="size-5" />
										</Button>
									{/snippet}
								</Tooltip.Trigger>
								<Tooltip.Content>Save frame</Tooltip.Content>
							</Tooltip.Root>
						{/if}
						{#if session.hasMenu}
							<Button variant="ghost" size="sm" class="{iconButton} gap-1.5 px-2" onclick={() => session.menu()} aria-label="Disc menu">
								<RiDiscLine class="size-5" /> <span class="text-xs">Menu</span>
							</Button>
						{/if}
						<SettingsMenu {session} bind:open={menuOpen} onsubtitlefile={() => subInput.click()} />
						<Button variant="ghost" size="icon" class={iconButton} onclick={toggleFullscreen} aria-label="Fullscreen">
							{#if fullscreen}<RiFullscreenExitLine class="size-5" />{:else}<RiFullscreenLine class="size-5" />{/if}
						</Button>
					</div>
				</div>
			</div>
		</div>

		{#if !opened}
			<div class="flex flex-1 flex-col gap-6">
				<div
					role="presentation"
					class="border-border grid place-items-center rounded-xl border-2 border-dashed p-8 text-center transition-colors {dragging
						? 'border-primary bg-primary/5'
						: ''}"
				>
					<div class="flex max-w-md flex-col items-center gap-4">
						<div class="bg-muted grid size-14 place-items-center rounded-full">
							<RiUploadCloud2Line class="text-muted-foreground size-7" />
						</div>
						<div>
							<p class="font-medium">{session.ready ? 'Drop a video, a song, or a DVD folder' : 'Starting VLC…'}</p>
							<p class="text-muted-foreground mt-1 text-sm text-balance">
								RealMedia, WMV, DivX AVI, DVD images and VIDEO_TS folders, FLV, MKV with subtitles, tracker music, chiptunes and
								more. Files are read from your disk as they play and never leave your device.
							</p>
						</div>
						<div class="flex flex-wrap justify-center gap-2">
							<Button disabled={!session.ready} onclick={() => fileInput.click()}><RiFolderOpenLine /> Choose files</Button>
							<Button variant="outline" disabled={!session.ready} onclick={() => folderInput.click()}>
								<RiFolderVideoLine /> Open a DVD folder
							</Button>
						</div>
					</div>
				</div>

				<section class="flex flex-col gap-3">
					<div class="flex items-baseline justify-between gap-4">
						<h2 class="text-sm font-semibold">Or try one no browser can play</h2>
						<a href="/formats" class="text-primary text-xs font-medium hover:underline">What can it play? →</a>
					</div>
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each SAMPLES as s (s.title)}
							<button
								type="button"
								disabled={!session.ready || !!loadingSample}
								onclick={() => openSample(s)}
								class="border-border hover:border-primary/60 hover:bg-muted/40 flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors disabled:cursor-wait disabled:opacity-60"
							>
								<span class="flex items-center justify-between gap-2 text-sm font-medium">
									{s.title}
									{#if loadingSample === s.title}<span class="border-muted-foreground/30 border-t-primary size-4 animate-spin rounded-full border-2"></span>{/if}
								</span>
								<span class="text-muted-foreground text-xs leading-relaxed">{s.plain}</span>
								<span class="text-muted-foreground/80 mt-auto pt-1 font-mono text-[10px] leading-snug">{s.format}</span>
							</button>
						{/each}
					</div>
				</section>
			</div>
		{/if}

		<footer class="text-muted-foreground mt-auto hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:flex">
			<span class="inline-flex items-center gap-1"><Kbd>Space</Kbd> play/pause</span>
			<span class="inline-flex items-center gap-1"><Kbd>←</Kbd><Kbd>→</Kbd> seek</span>
			<span class="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> volume</span>
			<span class="inline-flex items-center gap-1"><Kbd>F</Kbd> fullscreen</span>
			<span class="inline-flex items-center gap-1"><Kbd>.</Kbd> next frame</span>
			<span class="inline-flex items-center gap-1"><Kbd>←</Kbd><Kbd>↑</Kbd><Kbd>Enter</Kbd> on a DVD menu</span>
			<a href="/formats" class="ml-auto hover:underline">What can it play?</a>
		</footer>
	</main>
</Tooltip.Provider>
