import { createVLC, type Player, type Track, type VLC } from 'libvlc-wasm';

const SUBTITLE = /\.(srt|ass|ssa|vtt|sub|idx|smi|sami|usf|ttml|dfxp|mpl|jss|rt|pjs|psb|scc|stl)$/i;
export const isSubtitle = (f: File) => SUBTITLE.test(f.name);

/**
 * Reactive wrapper around one libvlc-wasm Player: every field the UI reads is
 * $state, kept in sync from the player's events.
 */
export class Session {
	vlc: VLC | null = null;
	player: Player | null = null;

	ready = $state(false);
	error = $state<string | null>(null);
	engine = $state('');
	name = $state('');
	state = $state('idle');
	time = $state(0);
	duration = $state(0);
	volume = $state(1);
	muted = $state(false);
	rate = $state(1);
	tracks = $state<Track[]>([]);
	chapters = $state<{ name: string | null; time: number }[]>([]);
	/** DVD titles (and the menu), or MKV editions. */
	titles = $state<{ name: string | null; duration: number; menu: boolean }[]>([]);
	title = $state(-1);
	chapter = $state(-1);
	ended = $state(false);
	presets = $state<string[]>([]);
	equalizer = $state<number | null>(null);
	aspect = $state<string | null>(null);
	deinterlace = $state(false);
	subtitleDelay = $state(0);
	level = $state(0);

	#raf = 0;

	get playing() { return this.state === 'playing'; }
	get hasVideo() { return this.tracks.some((t) => t.type === 'video'); }
	get video() { return this.tracks.filter((t) => t.type === 'video'); }
	get audio() { return this.tracks.filter((t) => t.type === 'audio'); }
	get subtitles() { return this.tracks.filter((t) => t.type === 'text'); }
	get inMenu() { return !!this.titles[this.title]?.menu; }
	get hasMenu() { return this.titles.some((t) => t.menu); }

	async start(canvas: HTMLCanvasElement) {
		try {
			// ?webcodecs=0 forces software decoding (handy for comparing).
			const q = new URLSearchParams(location.search);
			this.vlc = await createVLC({ logLevel: 'error', args: q.get('webcodecs') === '0' ? ['--no-webcodecs'] : [] });
			this.engine = `libvlc ${this.vlc.version.version.split(' ')[0]} · ready in ${Math.round(this.vlc.startupMs)} ms`;
			const p = await this.vlc.createPlayer({ canvas });
			this.player = p;
			p.on('statechange', (s) => { this.state = s; });
			p.on('durationchange', (d) => { this.duration = d; });
			p.on('tracks', (t) => { this.tracks = t; });
			p.on('chapters', (c) => {
				this.chapters = c.chapters;
				this.titles = c.titles;
				this.title = c.title;
				this.chapter = c.chapter;
			});
			p.on('chapterchange', ({ title, chapter }) => { this.title = title; this.chapter = chapter; });
			p.on('ended', () => { this.ended = true; });
			p.on('playing', () => { this.ended = false; });
			p.on('volumechange', ({ volume, muted }) => { this.volume = volume; this.muted = muted; });
			p.on('ratechange', (r) => { this.rate = r; });
			p.on('audiolevel', (l) => { this.level = l.peak; });
			p.on('error', (e) => { this.error = e.message; });
			this.presets = (await this.vlc.equalizerPresets()).presets;
			const tick = () => {
				this.#raf = requestAnimationFrame(tick);
				this.time = p.currentTime;
			};
			tick();
			this.ready = true;
		} catch (e) {
			this.error = (e as Error).message;
		}
	}

	/** Opens dropped/picked files: media plus any subtitle files that came with it. */
	async open(files: File[]) {
		const p = this.player;
		if (!p || !files.length) return;
		this.unlockAudio();
		// A DVD folder (VIDEO_TS): its files go in together and play as a disc.
		const disc = files.filter((f) => /\.(ifo|bup|vob)$/i.test(f.name));
		if (disc.some((f) => /^video_ts\.ifo$/i.test(f.name))) {
			this.#reset(files[0].webkitRelativePath?.split('/')[0] || 'DVD');
			await p.open(disc);
			return;
		}
		const media = files.filter((f) => !isSubtitle(f));
		const subs = files.filter(isSubtitle);
		if (!media.length) return this.addSubtitles(subs);
		this.#reset(media[0].name);
		const idx = subs.find((s) => /\.idx$/i.test(s.name));
		await p.open(media[0], {
			subtitles: idx ? [idx, ...subs.filter((s) => s !== idx)] : subs[0],
		});
	}

	#reset(name: string) {
		this.error = null;
		this.ended = false;
		this.name = name;
		this.tracks = [];
		this.chapters = [];
		this.titles = [];
		this.title = this.chapter = -1;
		this.duration = 0;
	}

	/** Browsers start audio only after a click or key; any one will do. */
	unlockAudio() {
		const ctx = this.player?.audioContext;
		if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
	}

	async addSubtitles(files: File[]) {
		if (!files.length || !this.player) return;
		const idx = files.find((s) => /\.idx$/i.test(s.name));
		await this.player.addSubtitles(idx ? [idx, ...files.filter((s) => s !== idx)] : files[0]);
	}

	toggle() {
		if (this.ended && this.player) { this.ended = false; return this.player.play(); }
		return this.player?.togglePause();
	}
	setTitle(i: number) { return this.player?.setTitle(i); }
	setChapter(i: number) { return this.player?.setChapter(i); }
	menu() { return this.player?.menu(); }
	navigate(a: 'activate' | 'up' | 'down' | 'left' | 'right') { return this.player?.navigate(a); }
	seek(t: number) { return this.player?.seek(Math.max(0, Math.min(t, this.duration || t))); }
	skip(dt: number) { return this.seek(this.time + dt); }
	setVolume(v: number) { if (this.player) { this.player.volume = v; this.volume = v; } }
	toggleMute() { if (this.player) this.player.muted = !this.muted; }
	setRate(r: number) { if (this.player) this.player.rate = r; }
	selectTrack(type: 'audio' | 'video' | 'text', id: string | null) {
		return id ? this.player?.selectTrack(id) : this.player?.disableTrack(type);
	}
	async setEqualizer(i: number | null) { this.equalizer = i; await this.player?.setEqualizer(i); }
	async setAspect(a: string | null) { this.aspect = a; await this.player?.setAspectRatio(a); }
	async setDeinterlace(on: boolean) { this.deinterlace = on; await this.player?.setDeinterlace(on); }
	async setSubtitleDelay(s: number) { this.subtitleDelay = s; await this.player?.setSubtitleDelay(s); }

	async snapshot() {
		const blob = await this.player?.snapshot();
		if (!blob) return;
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${this.name.replace(/\.[^.]+$/, '') || 'frame'}-${this.time.toFixed(2)}s.png`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	destroy() {
		cancelAnimationFrame(this.#raf);
		this.vlc?.destroy();
	}
}

export function formatTime(s: number) {
	if (!Number.isFinite(s) || s < 0) s = 0;
	const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
	return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}

export function trackLabel(t: Track) {
	const lang = t.language ? t.language.toUpperCase() : null;
	const name = t.name || t.description;
	return [name, lang, t.codecName ?? t.codec.trim()].filter(Boolean).join(' · ');
}
