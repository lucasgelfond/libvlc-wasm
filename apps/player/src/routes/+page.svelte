<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import * as Popover from '$lib/components/ui/popover';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import SidePanel from '$lib/components/SidePanel.svelte';
	import Playlist from '$lib/components/Playlist.svelte';
	import FormatsPopover from '$lib/components/FormatsPopover.svelte';
	import SampleMenu from '$lib/components/SampleMenu.svelte';
	import { Session, formatTime } from '$lib/session.svelte';
	import { SAMPLES, loadSample, type Sample } from '$lib/samples';
	import { ROWS } from '$lib/compat';
	import RiPlayFill from 'remixicon-svelte/icons/play-fill';
	import RiPauseFill from 'remixicon-svelte/icons/pause-fill';
	import RiReplay10Line from 'remixicon-svelte/icons/replay-10-line';
	import RiForward10Line from 'remixicon-svelte/icons/forward-10-line';
	import RiVolumeUpFill from 'remixicon-svelte/icons/volume-up-fill';
	import RiVolumeDownFill from 'remixicon-svelte/icons/volume-down-fill';
	import RiVolumeMuteFill from 'remixicon-svelte/icons/volume-mute-fill';
	import RiFullscreenLine from 'remixicon-svelte/icons/fullscreen-line';
	import RiFullscreenExitLine from 'remixicon-svelte/icons/fullscreen-exit-line';
	import RiAddLine from 'remixicon-svelte/icons/add-line';
	import RiUploadCloud2Line from 'remixicon-svelte/icons/upload-cloud-2-line';
	import RiMusic2Line from 'remixicon-svelte/icons/music-2-line';
	import RiDiscLine from 'remixicon-svelte/icons/disc-line';
	import RiRestartLine from 'remixicon-svelte/icons/restart-line';

	const session = new Session();
	let canvas: HTMLCanvasElement;
	let stage: HTMLDivElement;
	let fileInput: HTMLInputElement;
	let folderInput: HTMLInputElement;
	let subInput: HTMLInputElement;
	let dragging = $state(false);
	let fullscreen = $state(false);
	let idle = $state(false);
	let scrub = $state<number | null>(null);
	let scrubbing = false;
	let idleTimer = 0;
	let loadingSample = $state<string | null>(null);
	let volumeOpen = $state(false);

	onMount(() => {
		if (import.meta.env.DEV) (window as unknown as { session: Session }).session = session;
		session.start(canvas).then(() => {
			if (session.ready) openFromQuery();
		});
		const onFs = () => (fullscreen = !!document.fullscreenElement);
		document.addEventListener('fullscreenchange', onFs);
		return () => document.removeEventListener('fullscreenchange', onFs);
	});
	onDestroy(() => session.destroy());

	$effect(() => {
		if (session.error) toast.error(session.error);
	});

	const opened = $derived(session.current >= 0);
	const showControls = $derived(!idle || !session.playing || scrub !== null || volumeOpen);
	// The stage takes the shape of what is drawn (pixel aspect, forced aspect
	// ratio and crop included); audio gets a 16:9 card.
	const aspect = $derived.by(() => {
		void session.shape;
		return session.hasVideo ? (session.player?.aspect ?? 16 / 9) : 16 / 9;
	});
	const codecs = $derived([
		...new Set(session.tracks.filter((t) => t.type !== 'text').map((t) => (t.codecName ?? t.codec).replace(/\s*\(.*\)$/, '')))
	]);
	const video = $derived(session.video.find((t) => t.selected) ?? session.video[0]);
	const iconButton = 'text-white hover:bg-white/15 hover:text-white';
	// Only when real time is missing: short clips end a frame or two before their stated length.
	const shortEnd = $derived(session.duration - session.time > Math.max(2, session.duration * 0.05));

	async function addFiles(list: FileList | File[] | null | undefined) {
		const files = [...(list ?? [])];
		if (!files.length) return;
		try {
			await session.add(files);
		} catch (e) {
			toast.error((e as Error).message);
		}
	}

	/**
	 * Links straight into a file:
	 *   ?sample=dvd            a gallery sample (bundled with the app)
	 *   ?test=realvideo-3-cook  any test-corpus file, by its id (from a dev checkout)
	 *   ?url=https://…          a remote file; the server must allow CORS
	 */
	async function openFromQuery() {
		const q = new URLSearchParams(location.search);
		const sample = q.get('sample'), test = q.get('test'), url = q.get('url');
		if (sample) {
			const s = SAMPLES.find((x) => x.id === sample);
			if (s) return openSample(s);
			toast.error(`No sample called "${sample}". Try one of: ${SAMPLES.map((x) => x.id).join(', ')}.`);
		} else if (test) {
			const r = ROWS.find((x) => x.id === test);
			if (!r) return toast.error(`No test file called "${test}".`);
			try {
				await addFiles(await loadSample({ id: r.id, kind: r.hasVideo ? 'video' : 'audio', files: [r.file], title: r.name, plain: r.plain, format: r.format }));
			} catch {
				toast.error(`${r.name} isn't bundled with this site. Download it and drop it here: ${r.url}`);
			}
		} else if (url) {
			try {
				await session.addUrl(url);
			} catch (e) {
				toast.error(`Could not open ${url}: ${(e as Error).message}`);
			}
		}
	}

	async function openSample(s: Sample) {
		loadingSample = s.title;
		try {
			await addFiles(await loadSample(s));
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
		if (!opened || (e.target as HTMLElement).closest('input, [role=menu], [role=slider], [role=listbox], [role=combobox], [role=tab]')) return;
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
		else if (k === 'n' && session.current + 1 < session.playlist.length) session.play(session.current + 1);
		else if (k === '>') session.setRate(Math.min(4, +(session.rate + 0.25).toFixed(2)));
		else if (k === '<') session.setRate(Math.max(0.25, +(session.rate - 0.25).toFixed(2)));
		else return;
		e.preventDefault();
		poke();
	}
</script>

<svelte:head><title>{session.name ? `${session.name} · libvlc-wasm` : 'libvlc-wasm'}</title></svelte:head>

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
		if (e.dataTransfer) droppedFiles(e.dataTransfer).then(addFiles, (err) => toast.error(err.message));
	}}
/>

<input bind:this={fileInput} type="file" multiple class="hidden" onchange={(e) => addFiles(e.currentTarget.files)} />
<input bind:this={folderInput} type="file" webkitdirectory class="hidden" onchange={(e) => addFiles(e.currentTarget.files)} />
<input bind:this={subInput} type="file" multiple class="hidden" onchange={(e) => session.addSubtitles([...(e.currentTarget.files ?? [])])} />

<Tooltip.Provider delayDuration={400}>
	<main class="mx-auto flex min-h-svh max-w-[1400px] flex-col gap-4 px-4 py-4 sm:px-6">
		<header class="flex items-center gap-3">
			<svg viewBox="0 0 32 32" class="size-8 shrink-0" aria-hidden="true">
				<rect width="32" height="32" rx="8" class="fill-primary" />
				<path d="M16 6 8.5 24h15z" class="fill-primary-foreground" />
				<path d="M10.2 20h11.6" class="stroke-primary" stroke-width="2" />
			</svg>
			<div class="min-w-0 flex-1">
				<h1 class="font-display truncate text-lg leading-tight font-semibold tracking-tight">{opened ? session.name : 'libvlc-wasm'}</h1>
				{#if opened && codecs.length}
					<p class="text-muted-foreground truncate font-mono text-[11px]">
						{codecs.join(' · ')}{#if video?.width}&nbsp;· {video.width}×{video.height}{/if}
					</p>
				{/if}
			</div>
			<FormatsPopover />
			{#if session.playlist.length}
				<SampleMenu onpick={openSample} disabled={!session.ready || !!loadingSample} loading={loadingSample} />
				<Button size="sm" onclick={() => fileInput.click()}><RiAddLine /> Add files</Button>
			{/if}
		</header>

		<section class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
			<div class="flex min-w-0 flex-col gap-4">
				<div
					bind:this={stage}
					role="region"
					aria-label="Player"
					class="relative mx-auto w-full overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-black/10 {opened ? '' : 'hidden'} {idle &&
					session.playing
						? 'cursor-none'
						: ''}"
					style={fullscreen ? '' : `aspect-ratio: ${aspect}; max-width: calc((100svh - 180px) * ${aspect})`}
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
						<div class="absolute inset-0 grid place-items-center bg-black/55">
							<div class="flex max-w-sm flex-col items-center gap-3 px-6 text-center text-white">
								<p class="text-sm font-medium">{shortEnd ? 'Playback stopped early' : 'Finished'}</p>
								{#if shortEnd}
									<p class="text-xs text-white/70">
										It stopped at {formatTime(session.time)}, earlier than its reported length of {formatTime(session.duration)}: the file is
										probably cut short.
									</p>
								{/if}
								<Button variant="secondary" size="sm" onclick={() => session.toggle()}><RiRestartLine /> Play again</Button>
							</div>
						</div>
					{/if}

					{#if session.state === 'opening'}
						<div class="pointer-events-none absolute inset-0 grid place-items-center">
							<div class="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white"></div>
						</div>
					{/if}

					<div
						class="absolute inset-x-3 bottom-3 flex flex-col gap-0.5 rounded-2xl bg-black/55 px-3 pt-1 pb-1.5 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md transition-opacity duration-300 {showControls
							? ''
							: 'pointer-events-none opacity-0'}"
					>
						<!-- The slider also reports programmatic value changes, so only a
						     pointer or key actually on it counts as scrubbing. -->
						<div role="presentation" onpointerdowncapture={() => (scrubbing = true)} onkeydowncapture={() => (scrubbing = true)}>
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
											{#if session.muted || session.volume === 0}<RiVolumeMuteFill class="size-5" />
											{:else if session.volume < 0.5}<RiVolumeDownFill class="size-5" />
											{:else}<RiVolumeUpFill class="size-5" />{/if}
										</Button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content side="top" class="w-60">
									<div class="flex items-center gap-3">
										<Button variant="ghost" size="icon-sm" onclick={() => session.toggleMute()} aria-label="Mute">
											{#if session.muted}<RiVolumeMuteFill />{:else}<RiVolumeUpFill />{/if}
										</Button>
										<Slider type="single" min={0} max={2} step={0.01} value={session.muted ? 0 : session.volume} onValueChange={(v) => session.setVolume(v)} aria-label="Volume" />
										<span class="text-muted-foreground w-10 text-right text-xs tabular-nums">{Math.round((session.muted ? 0 : session.volume) * 100)}%</span>
									</div>
								</Popover.Content>
							</Popover.Root>
							<span class="ml-1 text-xs text-white/85 tabular-nums">
								{formatTime(scrub ?? session.time)} <span class="text-white/50">/ {formatTime(session.duration)}</span>
							</span>
							{#if session.rate !== 1}<span class="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium">{session.rate}×</span>{/if}
							<div class="ml-auto flex items-center gap-1">
								{#if session.hasMenu}
									<Button variant="ghost" size="sm" class="{iconButton} gap-1.5 px-2" onclick={() => session.menu()} aria-label="Disc menu">
										<RiDiscLine class="size-5" /> <span class="text-xs">Menu</span>
									</Button>
								{/if}
								<Button variant="ghost" size="icon" class={iconButton} onclick={toggleFullscreen} aria-label="Fullscreen">
									{#if fullscreen}<RiFullscreenExitLine class="size-5" />{:else}<RiFullscreenLine class="size-5" />{/if}
								</Button>
							</div>
						</div>
					</div>
				</div>

				{#if !opened}
					<div
						role="button"
						tabindex="0"
						aria-label="Choose files to play"
						onclick={() => session.ready && fileInput.click()}
						onkeydown={(e) => {
							if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
								e.preventDefault();
								fileInput.click();
							}
						}}
						class="group border-border hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-ring flex min-h-80 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors outline-none focus-visible:ring-2 {dragging
							? 'border-primary bg-primary/10'
							: ''} {session.ready ? '' : 'cursor-wait opacity-70'}"
					>
						<span class="bg-muted group-hover:bg-primary/15 grid size-14 place-items-center rounded-full transition-colors">
							<RiUploadCloud2Line class="text-muted-foreground group-hover:text-primary size-7 transition-colors" />
						</span>
						<span class="flex flex-col gap-1.5">
							<span class="font-display text-xl font-semibold tracking-tight">
								{session.ready ? (dragging ? 'Drop to play' : 'Drop videos, music or folders here') : 'Starting VLC…'}
							</span>
							<span class="text-muted-foreground text-sm">Nothing is uploaded, all playback occurs totally in your browser.</span>
						</span>
						<span class="text-muted-foreground mt-2 flex flex-wrap items-center justify-center gap-2 text-sm">
							or use a
							<SampleMenu onpick={openSample} disabled={!session.ready || !!loadingSample} loading={loadingSample} />
						</span>
					</div>
					<p class="text-muted-foreground -mt-2 text-center text-xs">
						A whole folder, such as a DVD's VIDEO_TS or a season of episodes?
						<button type="button" class="text-primary font-medium hover:underline" onclick={() => folderInput.click()} disabled={!session.ready}>Choose a folder</button>
					</p>
				{/if}

				{#if session.playlist.length}
					<section class="flex flex-col gap-2">
						<h2 class="text-muted-foreground font-mono text-[11px] tracking-widest uppercase">Playlist · {session.playlist.length}</h2>
						<Playlist {session} />
					</section>
				{/if}

			</div>

			<aside class="bg-card border-border flex max-h-[calc(100svh-6rem)] min-h-96 flex-col rounded-xl border p-3 lg:sticky lg:top-4">
				<SidePanel {session} onsubtitlefile={() => subInput.click()} />
			</aside>
		</section>
	</main>
</Tooltip.Provider>
