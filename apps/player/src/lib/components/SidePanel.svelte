<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Slider } from '$lib/components/ui/slider';
	import { Switch } from '$lib/components/ui/switch';
	import { Kbd } from '$lib/components/ui/kbd';
	import Pick from './Pick.svelte';
	import { trackLabel, formatTime, type Session } from '$lib/session.svelte';
	import RiCamera3Line from 'remixicon-svelte/icons/camera-3-line';
	import RiSkipForwardLine from 'remixicon-svelte/icons/skip-forward-line';
	import RiClosedCaptioningLine from 'remixicon-svelte/icons/closed-captioning-line';

	let { session, onsubtitlefile }: { session: Session; onsubtitlefile: () => void } = $props();

	let tab = $state('tracks');
	const SPEEDS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2', '3', '4'];
	const ASPECTS = ['16:9', '4:3', '21:9', '2.35:1', '1:1'];
	const CROPS = ['16:9', '4:3', '2.35:1', '1:1'];
	const DEINTERLACE = ['off', 'auto', 'yadif', 'yadif2x', 'blend', 'bob', 'linear', 'x', 'phosphor', 'ivtc'];
	const ADJUST: [keyof typeof session.adjust, string, number, number, number][] = [
		['brightness', 'Brightness', 0, 2, 0.01],
		['contrast', 'Contrast', 0, 2, 0.01],
		['saturation', 'Saturation', 0, 3, 0.01],
		['hue', 'Hue', -180, 180, 1],
		['gamma', 'Gamma', 0.1, 4, 0.01]
	];

	const tracksOf = (type: 'video' | 'audio' | 'text') => session.tracks.filter((t) => t.type === type);
	const selectedOf = (type: 'video' | 'audio' | 'text') => tracksOf(type).find((t) => t.selected)?.id ?? 'off';
	const trackOptions = (type: 'video' | 'audio' | 'text'): [string, string][] => {
		const list = tracksOf(type).map((t): [string, string] => [t.id, trackLabel(t)]);
		return list.length ? [['off', 'Off'], ...list] : [];
	};

	// Live statistics while the Stats tab is open.
	$effect(() => {
		if (tab !== 'stats') return;
		session.refreshStats();
		const t = setInterval(() => session.refreshStats(), 1000);
		return () => clearInterval(t);
	});

	const STATE = ['idle', 'opening', 'playing', 'paused', 'stopping', 'ended', 'error'];
	const kbit = (v?: number) => (v ? `${Math.round(v * 8000)} kbit/s` : '—');
	const bytes = (v?: number) => (!v ? '—' : v > 1e6 ? `${(v / 1e6).toFixed(1)} MB` : `${Math.round(v / 1e3)} KB`);
	const statRows = $derived.by(() => {
		const s = session.stats;
		if (!s) return [];
		return [
			['Section', 'Playback'],
			['State', STATE[s.state] ?? String(s.state)],
			['Position', `${formatTime(s.time)} / ${formatTime(s.length)}`],
			['Speed', `${s.rate}×`],
			['Section', 'Input'],
			['Read from the file', bytes(s.readBytes)],
			['Input bitrate', kbit(s.inputBitrate)],
			['Demuxed bitrate', kbit(s.demuxBitrate)],
			['Corrupt / discontinuities', `${s.demuxCorrupted ?? 0} / ${s.demuxDiscontinuity ?? 0}`],
			['Section', 'Video'],
			['Frames decoded', s.decodedVideo ?? 0],
			['Frames shown', s.displayedPictures ?? s.framesDisplayed ?? 0],
			['Drawn on the canvas', s.framesDrawn ?? 0],
			['Late / lost', `${s.latePictures ?? 0} / ${s.lostPictures ?? 0}`],
			['Section', 'Audio'],
			['Blocks decoded', s.decodedAudio ?? 0],
			['Blocks played / lost', `${s.playedAudioBuffers ?? 0} / ${s.lostAudioBuffers ?? 0}`],
			['Underruns', s.audioUnderruns ?? 0]
		] as [string, string | number][];
	});

	const info = $derived(session.item?.info && !('error' in session.item.info) ? session.item.info : null);
</script>

<Tabs.Root bind:value={tab} class="flex h-full min-h-0 flex-col gap-3">
	<Tabs.List class="grid w-full grid-cols-5">
		<Tabs.Trigger value="tracks">Tracks</Tabs.Trigger>
		<Tabs.Trigger value="effects">Effects</Tabs.Trigger>
		<Tabs.Trigger value="info">Info</Tabs.Trigger>
		<Tabs.Trigger value="stats">Stats</Tabs.Trigger>
		<Tabs.Trigger value="keys">Keys</Tabs.Trigger>
	</Tabs.List>

	<div class="min-h-0 flex-1 overflow-y-auto pr-1 text-sm">
		<Tabs.Content value="tracks" class="flex flex-col gap-4">
			<Pick label="Video" value={selectedOf('video')} options={trackOptions('video')} onchange={(v) => session.selectTrack('video', v === 'off' ? null : v)} />
			<Pick label="Audio" value={selectedOf('audio')} options={trackOptions('audio')} onchange={(v) => session.selectTrack('audio', v === 'off' ? null : v)} />
			<Pick label="Subtitles" value={selectedOf('text')} options={trackOptions('text')} onchange={(v) => session.selectTrack('text', v === 'off' ? null : v)} />
			<Button variant="outline" size="sm" onclick={onsubtitlefile} disabled={session.current < 0}>
				<RiClosedCaptioningLine /> Load a subtitle file…
			</Button>
			<div class="flex flex-col gap-2">
				<span class="text-muted-foreground flex justify-between text-xs font-medium">
					Subtitle delay <span class="tabular-nums">{session.subtitleDelay > 0 ? '+' : ''}{session.subtitleDelay.toFixed(1)} s</span>
				</span>
				<Slider type="single" min={-5} max={5} step={0.1} value={session.subtitleDelay} onValueChange={(v) => session.setSubtitleDelay(v)} aria-label="Subtitle delay" />
			</div>
			{#if session.titles.length > 1}
				<Pick
					label="Title"
					value={String(session.title)}
					options={session.titles.map((t, i): [string, string] => [String(i), `${t.name ?? `Title ${i}`}${!t.menu && t.duration ? ` · ${formatTime(t.duration)}` : ''}`])}
					onchange={(v) => session.setTitle(+v)}
				/>
			{/if}
			{#if session.chapters.length > 1}
				<div class="flex flex-col gap-1.5">
					<span class="text-muted-foreground text-xs font-medium">Chapters</span>
					<ol class="flex flex-col gap-1">
						{#each session.chapters as c, i (i)}
							<li>
								<button
									type="button"
									onclick={() => session.setChapter(i)}
									class="hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left {i === session.chapter ? 'bg-muted font-medium' : ''}"
								>
									<span class="truncate">{c.name ?? `Chapter ${i + 1}`}</span>
									<span class="text-muted-foreground text-xs tabular-nums">{formatTime(c.time)}</span>
								</button>
							</li>
						{/each}
					</ol>
				</div>
			{/if}
			<Pick label="Speed" value={String(session.rate)} options={SPEEDS.map((s): [string, string] => [s, s === '1' ? 'Normal' : `${s}×`])} onchange={(v) => session.setRate(+v)} />
			<div class="grid grid-cols-2 gap-2">
				<Button variant="outline" size="sm" onclick={() => session.player?.nextFrame()} disabled={session.current < 0}><RiSkipForwardLine /> Next frame</Button>
				<Button variant="outline" size="sm" onclick={() => session.snapshot()} disabled={!session.hasVideo}><RiCamera3Line /> Snapshot</Button>
			</div>
		</Tabs.Content>

		<Tabs.Content value="effects" class="flex flex-col gap-4">
			<Pick
				label="Equalizer"
				value={session.equalizer == null ? 'off' : String(session.equalizer)}
				options={[['off', 'Off'], ...session.presets.map((p, i): [string, string] => [String(i), p])]}
				onchange={(v) => session.setEqualizer(v === 'off' ? null : +v)}
			/>
			<Pick label="Deinterlace" value={session.deinterlace} options={DEINTERLACE.map((m): [string, string] => [m, m === 'off' ? 'Off' : m === 'auto' ? 'Automatic' : m])} onchange={(v) => session.setDeinterlace(v)} />
			<div class="grid grid-cols-2 gap-3">
				<Pick label="Aspect ratio" value={session.aspect ?? 'auto'} options={[['auto', 'As encoded'], ...ASPECTS.map((a): [string, string] => [a, a])]} onchange={(v) => session.setAspect(v === 'auto' ? null : v)} />
				<Pick label="Crop" value={session.crop ?? 'none'} options={[['none', 'None'], ...CROPS.map((a): [string, string] => [a, a])]} onchange={(v) => session.setCrop(v === 'none' ? null : v)} />
			</div>
			<div class="border-border flex flex-col gap-3 rounded-lg border p-3">
				<label class="flex items-center justify-between text-xs font-medium">
					Picture adjustments
					<Switch checked={session.adjustOn} onCheckedChange={(on) => { session.adjustOn = on; session.applyAdjust(); }} aria-label="Picture adjustments" />
				</label>
				{#each ADJUST as [key, name, min, max, step] (key)}
					<div class="flex flex-col gap-1.5 {session.adjustOn ? '' : 'opacity-50'}">
						<span class="text-muted-foreground flex justify-between text-xs">
							{name}<span class="tabular-nums">{session.adjust[key].toFixed(key === 'hue' ? 0 : 2)}</span>
						</span>
						<Slider
							type="single"
							{min}
							{max}
							{step}
							value={session.adjust[key]}
							disabled={!session.adjustOn}
							onValueChange={(v) => { session.adjust[key] = v; session.applyAdjust(); }}
							aria-label={name}
						/>
					</div>
				{/each}
				<Button variant="ghost" size="sm" onclick={() => session.resetAdjust()} disabled={!session.adjustOn}>Reset</Button>
			</div>
			<div class="flex flex-col gap-2">
				<span class="text-muted-foreground flex justify-between text-xs font-medium">
					Audio delay <span class="tabular-nums">{session.audioDelay > 0 ? '+' : ''}{session.audioDelay.toFixed(2)} s</span>
				</span>
				<Slider type="single" min={-2} max={2} step={0.05} value={session.audioDelay} onValueChange={(v) => session.setAudioDelay(v)} aria-label="Audio delay" />
			</div>
		</Tabs.Content>

		<Tabs.Content value="info" class="flex flex-col gap-3">
			{#if session.item}
				<p class="font-medium break-all">{session.item.name}</p>
				{#if session.item.info && 'error' in session.item.info}
					<p class="text-destructive text-xs">{session.item.info.error}</p>
				{/if}
				<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
					{#if session.duration}<dt class="text-muted-foreground">Duration</dt><dd class="tabular-nums">{formatTime(session.duration)}</dd>{/if}
					{#each Object.entries(info?.meta ?? {}) as [k, v] (k)}
						{#if v && k !== 'title'}<dt class="text-muted-foreground capitalize">{k}</dt><dd class="break-words">{v}</dd>{/if}
					{/each}
				</dl>
				<div class="flex flex-col gap-2">
					{#each session.tracks as t (t.id)}
						<div class="border-border rounded-md border px-2.5 py-2 text-xs">
							<p class="font-medium capitalize">{t.type === 'text' ? 'subtitles' : t.type} · {t.codecName ?? t.codec.trim()}</p>
							<p class="text-muted-foreground mt-0.5">
								{[t.width ? `${t.width}×${t.height}` : '', t.fps ? `${t.fps.toFixed(3)} fps` : '', t.rate ? `${t.rate} Hz` : '', t.channels ? `${t.channels} ch` : '', t.language ?? '']
									.filter(Boolean)
									.join(' · ')}
							</p>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-muted-foreground">Open a file to see its container, streams and metadata.</p>
			{/if}
			<p class="text-muted-foreground border-border mt-2 border-t pt-3 text-xs">
				VLC {session.version || '…'} compiled to WebAssembly{session.startupMs ? `, started in ${session.startupMs} ms` : ''}.
			</p>
		</Tabs.Content>

		<Tabs.Content value="stats" class="flex flex-col">
			{#if session.current < 0}
				<p class="text-muted-foreground">Play something to see live statistics from VLC: bitrates, frames decoded and shown, audio buffers.</p>
			{:else if !statRows.length}
				<p class="text-muted-foreground">Reading statistics…</p>
			{:else}
				<dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
					{#each statRows as [k, v], i (i)}
						{#if k === 'Section'}
							<dt class="col-span-2 pt-2 text-xs font-semibold first:pt-0">{v}</dt>
						{:else}
							<dt class="text-muted-foreground">{k}</dt><dd class="text-right tabular-nums">{v}</dd>
						{/if}
					{/each}
				</dl>
			{/if}
		</Tabs.Content>

		<Tabs.Content value="keys">
			<dl class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs">
				<dt><Kbd>Space</Kbd></dt><dd>Play / pause</dd>
				<dt><Kbd>←</Kbd> <Kbd>→</Kbd></dt><dd>Seek 5 s (J / L: 10 s)</dd>
				<dt><Kbd>↑</Kbd> <Kbd>↓</Kbd></dt><dd>Volume</dd>
				<dt><Kbd>M</Kbd></dt><dd>Mute</dd>
				<dt><Kbd>F</Kbd></dt><dd>Fullscreen (or double-click)</dd>
				<dt><Kbd>.</Kbd></dt><dd>Next frame</dd>
				<dt><Kbd>&lt;</Kbd> <Kbd>&gt;</Kbd></dt><dd>Slower / faster</dd>
				<dt><Kbd>N</Kbd></dt><dd>Next in the playlist</dd>
				<dt><Kbd>←</Kbd> <Kbd>↑</Kbd> <Kbd>Enter</Kbd></dt><dd>Move around a DVD menu</dd>
			</dl>
		</Tabs.Content>
	</div>
</Tabs.Root>
