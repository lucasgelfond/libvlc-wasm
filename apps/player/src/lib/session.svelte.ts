import { createVLC, type MediaInfo, type Player, type Track, type VLC } from 'libvlc-wasm';

const SUBTITLE = /\.(srt|ass|ssa|vtt|sub|idx|smi|sami|usf|ttml|dfxp|mpl|jss|rt|pjs|psb|scc|stl)$/i;
export const isSubtitle = (f: File) => SUBTITLE.test(f.name);
const DISC = /\.(ifo|bup|vob)$/i;

/** One entry of the playlist: a file, or the files of a DVD folder. */
export type Item = {
	name: string;
	files: File[];
	/** Played straight from the network (ranged requests) instead of files. */
	url?: string;
	subtitles: File[];
	disc: boolean;
	info: MediaInfo | { error: string } | null;
	thumb: string | null;
};

export type Adjust = { brightness: number; contrast: number; saturation: number; hue: number; gamma: number };
export const NEUTRAL: Adjust = { brightness: 1, contrast: 1, saturation: 1, hue: 0, gamma: 1 };

/**
 * Reactive wrapper around one libvlc-wasm Player plus a playlist: every field
 * the UI reads is $state, kept in sync from the player's events.
 */
export class Session {
	vlc: VLC | null = null;
	player: Player | null = null;

	ready = $state(false);
	error = $state<string | null>(null);
	version = $state('');
	startupMs = $state(0);

	playlist = $state<Item[]>([]);
	current = $state(-1);

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
	level = $state(0);
	/** Bumped when the picture's shape may have changed (aspect, crop, new file). */
	shape = $state(0);

	presets = $state<string[]>([]);
	equalizer = $state<number | null>(null);
	aspect = $state<string | null>(null);
	crop = $state<string | null>(null);
	deinterlace = $state<string>('off');
	adjustOn = $state(false);
	adjust = $state<Adjust>({ ...NEUTRAL });
	subtitleDelay = $state(0);
	audioDelay = $state(0);
	stats = $state<Record<string, number> | null>(null);

	#raf = 0;

	get item() { return this.playlist[this.current] ?? null; }
	get name() { return this.item?.name ?? ''; }
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
			this.version = this.vlc.version.version.split(' ')[0];
			this.startupMs = Math.round(this.vlc.startupMs);
			const p = await this.vlc.createPlayer({ canvas });
			this.player = p;
			p.on('statechange', (s) => { this.state = s; });
			p.on('durationchange', (d) => { this.duration = d; });
			// VLC drops its tracks when a file ends; keep showing the last ones.
			p.on('tracks', (t) => { if (t.length || this.state === 'opening') { this.tracks = t; this.shape++; } });
			p.on('chapters', (c) => {
				this.chapters = c.chapters;
				this.titles = c.titles;
				this.title = c.title;
				this.chapter = c.chapter;
			});
			p.on('chapterchange', ({ title, chapter }) => { this.title = title; this.chapter = chapter; });
			p.on('volumechange', ({ volume, muted }) => { this.volume = volume; this.muted = muted; });
			p.on('ratechange', (r) => { this.rate = r; });
			p.on('audiolevel', (l) => { this.level = l.peak; });
			p.on('playing', () => { this.ended = false; this.shape++; });
			p.on('ended', () => {
				// Carry on down the playlist; stop at its end.
				if (this.current + 1 < this.playlist.length) this.play(this.current + 1);
				else this.ended = true;
			});
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

	/**
	 * Adds dropped or picked files to the playlist and plays the first new one.
	 * A DVD folder becomes one item; subtitle files ride along with the video of
	 * the same name, or, added on their own, go onto whatever is playing.
	 */
	async add(files: File[], { play = true } = {}) {
		if (!files.length) return;
		this.unlockAudio();
		const items: Item[] = [];
		const isDisc = files.some((f) => /^video_ts\.ifo$/i.test(f.name));
		if (isDisc) {
			const folder = files[0].webkitRelativePath?.split('/')[0] || 'DVD';
			items.push({ name: folder, files: files.filter((f) => DISC.test(f.name)), subtitles: [], disc: true, info: null, thumb: null });
		}
		const rest = isDisc ? files.filter((f) => !DISC.test(f.name)) : files;
		const subs = rest.filter(isSubtitle);
		const media = rest.filter((f) => !isSubtitle(f) && !f.name.startsWith('.'));
		const stem = (n: string) => n.replace(/\.[^.]+$/, '').toLowerCase();
		for (const f of [...media].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
			const own = subs.filter((s) => stem(s.name).startsWith(stem(f.name)));
			items.push({ name: f.name, files: [f], subtitles: own.length ? own : media.length === 1 ? subs : [], disc: false, info: null, thumb: null });
		}
		if (!items.length) return this.addSubtitles(subs);
		const start = this.playlist.length;
		this.playlist = [...this.playlist, ...items];
		if (play) await this.play(start);
		for (let k = 0; k < items.length; k++) await this.#describe(start + k);
	}

	/** Adds a remote file: VLC reads it with ranged requests, so the server must allow CORS. */
	async addUrl(url: string) {
		const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || url);
		this.playlist = [...this.playlist, { name, files: [], url, subtitles: [], disc: false, info: null, thumb: null }];
		await this.play(this.playlist.length - 1);
	}

	async play(i: number) {
		const p = this.player;
		const it = this.playlist[i];
		if (!p || !it) return;
		this.current = i;
		this.error = null;
		this.ended = false;
		this.tracks = [];
		this.chapters = [];
		this.titles = [];
		this.title = this.chapter = -1;
		this.duration = 0;
		this.stats = null;
		const idx = it.subtitles.find((s) => /\.idx$/i.test(s.name));
		await p.open(it.url ?? (it.disc ? it.files : it.files[0]), {
			subtitles: idx ? [idx, ...it.subtitles.filter((s) => s !== idx)] : it.subtitles[0]
		});
	}

	remove(i: number) {
		const it = this.playlist[i];
		if (it?.thumb) URL.revokeObjectURL(it.thumb);
		this.playlist = this.playlist.filter((_, k) => k !== i);
		if (i < this.current) this.current--;
		else if (i === this.current) {
			if (this.playlist.length) this.play(Math.min(i, this.playlist.length - 1));
			else { this.current = -1; this.player?.stop(); }
		}
	}

	/** Container, codecs and a thumbnail for the playlist card. */
	async #describe(i: number) {
		const vlc = this.vlc;
		const it = this.playlist[i];
		if (!vlc || !it || it.disc || it.url) return;
		let info: Item['info'];
		let thumb: string | null = null;
		try {
			info = await vlc.probe(it.files[0]);
		} catch (e) {
			info = { error: (e as Error).message };
		}
		if (info && 'tracks' in info && info.tracks.some((t) => t.type === 'video')) {
			try {
				thumb = URL.createObjectURL((await vlc.thumbnail(it.files[0], { position: 0.2, width: 320 })).blob);
			} catch {
				/* no frame to show; the card keeps its placeholder */
			}
		}
		const k = this.playlist.indexOf(it);
		if (k >= 0) this.playlist[k] = { ...it, info, thumb };
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
	seek(t: number) { return this.player?.seek(Math.max(0, Math.min(t, this.duration || t))); }
	skip(dt: number) { return this.seek(this.time + dt); }
	setVolume(v: number) { if (this.player) { this.player.volume = v; this.volume = v; } }
	toggleMute() { if (this.player) this.player.muted = !this.muted; }
	setRate(r: number) { if (this.player) this.player.rate = r; }
	selectTrack(type: 'audio' | 'video' | 'text', id: string | null) {
		return id ? this.player?.selectTrack(id) : this.player?.disableTrack(type);
	}
	setTitle(i: number) { return this.player?.setTitle(i); }
	setChapter(i: number) { return this.player?.setChapter(i); }
	menu() { return this.player?.menu(); }
	navigate(a: 'activate' | 'up' | 'down' | 'left' | 'right') { return this.player?.navigate(a); }
	async setEqualizer(i: number | null) { this.equalizer = i; await this.player?.setEqualizer(i); }
	async setAspect(a: string | null) { this.aspect = a; await this.player?.setAspectRatio(a); this.#reshape(); }
	async setCrop(c: string | null) { this.crop = c; await this.player?.setCrop(c ? { ratio: c } : null); this.#reshape(); }
	async setDeinterlace(mode: string) {
		this.deinterlace = mode;
		await this.player?.setDeinterlace(mode === 'off' ? false : mode === 'auto' ? 'auto' : true, mode);
	}
	async applyAdjust() { await this.player?.setAdjust(this.adjustOn ? { ...this.adjust } : null); }
	async resetAdjust() { this.adjust = { ...NEUTRAL }; await this.applyAdjust(); }
	async setSubtitleDelay(s: number) { this.subtitleDelay = s; await this.player?.setSubtitleDelay(s); }
	async setAudioDelay(s: number) { this.audioDelay = s; await this.player?.setAudioDelay(s); }
	async refreshStats() {
		if (this.player && this.current >= 0) this.stats = (await this.player.stats()) as unknown as Record<string, number>;
	}
	/** The renderer picks up a new aspect or crop with the next frame. */
	#reshape() { setTimeout(() => this.shape++, 150); setTimeout(() => this.shape++, 500); }

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
