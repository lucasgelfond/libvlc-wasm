import { Emitter } from './emitter.js';
import { Renderer } from './renderer.js';
import { RING, VIDEO } from './layout.js';
import { EVENT, STATE_NAMES, checkOptions } from './engine.js';

const ADJUST = { contrast: 1, brightness: 2, hue: 3, saturation: 4, gamma: 5 };
const TRACK_TYPE = { audio: 0, video: 1, text: 2 };
const STOP_REASON = ['error', 'ended', 'user'];

/**
 * One libvlc media player bound to a canvas and the page's audio output.
 * Create it with `vlc.createPlayer()`.
 *
 * Times are in seconds, like HTMLMediaElement; volume is 0..1 (up to 2 for
 * VLC's boost).
 */
export class Player extends Emitter {
  /** @internal */
  constructor(vlc, id, opts) {
    super();
    this.vlc = vlc;
    this.id = id;
    this.opts = opts;
    this.ptr = 0;
    this.state = 'idle';
    this.duration = 0;
    this.tracks = [];
    this.chapters = { titles: [], chapters: [], title: -1, chapter: -1 };
    this.seekable = false;
    this._time = 0;
    this._timeAt = 0;
    this._rate = 1;
    this._volume = 1;
    this._muted = false;
    this._mrls = [];
    this._raf = 0;
    this._lastTimeEmit = 0;
    this._pendingTracks = 0;
    this.audioFramesPlayed = 0;
  }

  /** @internal */
  async _init() {
    const { canvas, audio = true, audioContext, fit } = this.opts;
    if (audio) {
      this.audioContext = audioContext ?? new AudioContext({ latencyHint: 'interactive' });
      this._ownsContext = !audioContext;
    }
    const rate = this.audioContext?.sampleRate ?? 48000;
    const { i: ptr } = await this.vlc._call('player_new', {
      i: [this.vlc._instance, this.id, rate, 2, Math.round(rate * 0.5)],
    });
    if (!ptr) throw new Error('libvlc_media_player_new() failed');
    // Unsigned: a player above 2 GB of wasm memory must not go negative.
    this.ptr = ptr >>> 0;
    this.ringPtr = this.ptr + this.vlc._layout.playerRing;
    this.videoPtr = this.ptr + this.vlc._layout.playerVideo;

    if (this.audioContext) await this._initAudio();
    if (canvas) this.attach(canvas, { fit });
    return this;
  }

  async _initAudio() {
    const ctx = this.audioContext;
    if (!workletLoaded.has(ctx)) {
      workletLoaded.set(ctx, ctx.audioWorklet.addModule(this.vlc._urls.worklet));
    }
    await workletLoaded.get(ctx);
    this.audioNode = new AudioWorkletNode(ctx, 'vlc-ring', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { memory: this.vlc._memory, ringPtr: this.ringPtr },
    });
    this.audioNode.connect(this.opts.audioDestination ?? ctx.destination);
    /** Latest output level, 0..1: { peak, rms } over the last ~100 ms. */
    this.audioLevel = { peak: 0, rms: 0 };
    this.audioFramesPlayed = 0;
    this.audioNode.port.onmessage = (e) => {
      if (e.data?.type !== 'level') return;
      this.audioLevel = { peak: e.data.peak, rms: e.data.rms };
      this.audioFramesPlayed = e.data.frames;
      this.emit('audiolevel', this.audioLevel);
    };
    this._ringHdr = new Int32Array(this.vlc._memory, this.ringPtr, 18);
    this._updateLatency();
  }

  /** The delay from the worklet to the speaker, which VLC folds into A/V sync. */
  _updateLatency() {
    const ctx = this.audioContext;
    if (!ctx || !this._ringHdr) return;
    const s = (ctx.baseLatency || 0) + (ctx.outputLatency || 0) + 128 / ctx.sampleRate;
    Atomics.store(this._ringHdr, RING.LATENCY_US, Math.round(s * 1e6));
  }

  /**
   * Draws video onto `canvas` (WebGL2). Call again to move it elsewhere.
   * @param {HTMLCanvasElement|OffscreenCanvas} canvas
   * @param {{ fit?: 'contain'|'cover'|'fill' }} [opts]
   */
  attach(canvas, opts = {}) {
    this.renderer?.destroy();
    this._unlistenPointer?.();
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, opts);
    this.renderer.bind(this.vlc._memory, this.videoPtr);
    this._startLoop();
    this._listenPointer(canvas);
  }

  // DVD menus take the mouse: while one is on screen, pointer events on the
  // canvas go to VLC (hover highlights a button, a click activates it).
  _listenPointer(canvas) {
    if (typeof canvas.addEventListener !== 'function' || typeof canvas.getBoundingClientRect !== 'function') return;
    let pending = null;
    const send = (type, e) => {
      if (!this.inMenu) return;
      const at = this._pictureCoords(e.clientX, e.clientY);
      if (!at) return;
      if (type === 'move') {
        // At most one move per frame: each is a round trip to VLC.
        if (!pending) requestAnimationFrame(() => { const p = pending; pending = null; this.pointer('move', p.x, p.y).catch(() => {}); });
        pending = at;
      } else {
        this.pointer(type, at.x, at.y).catch(() => {});
      }
    };
    const move = (e) => send('move', e);
    const down = (e) => { if (e.button === 0) send('down', e); };
    const up = (e) => { if (e.button === 0) send('up', e); };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    this._unlistenPointer = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
    };
  }

  /** Page coordinates to 0..1 over the drawn picture, or null outside it. */
  _pictureCoords(clientX, clientY) {
    const r = this.renderer;
    if (!r?.width || !this.canvas) return null;
    const box = this.canvas.getBoundingClientRect();
    const src = r.aspect, dst = box.width / box.height;
    let w = box.width, h = box.height;
    if (r.fit === 'contain') { if (src > dst) h = w / src; else w = h * src; }
    else if (r.fit === 'cover') { if (src > dst) w = h * src; else h = w / src; }
    const x = (clientX - box.left - (box.width - w) / 2) / w;
    const y = (clientY - box.top - (box.height - h) / 2) / h;
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  }

  _startLoop() {
    cancelAnimationFrame(this._raf);
    let lastLatencyCheck = 0;
    const loop = async (now) => {
      this._raf = requestAnimationFrame(loop);
      if (!this.renderer) return;
      const r = this.renderer.tick();
      if (r === 'grow' && !this._growing) {
        this._growing = true;
        try {
          await this.vlc._refreshMemory();
          this.renderer?.bind(this.vlc._memory, this.videoPtr);
        } catch { /* destroyed meanwhile; the next frame retries otherwise */ } finally {
          this._growing = false;
        }
      }
      if (now - lastLatencyCheck > 1000) { lastLatencyCheck = now; this._updateLatency(); }
      if (this.state === 'playing' && now - this._lastTimeEmit > 250) {
        this._lastTimeEmit = now;
        this.emit('timeupdate', this.currentTime);
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  /**
   * Opens a source and, by default, starts playing it.
   * @param {File|Blob|ArrayBuffer|Uint8Array|string} source a File from an
   *   input or drop, bytes, an http(s) URL (needs CORS + range requests), or a
   *   VLC MRL.
   * @param {{ autoplay?: boolean, startTime?: number, subtitles?: File|Blob|string,
   *           options?: string[], name?: string, decryptionKey?: string }} [opts]
   *   decryptionKey: hex key for a CENC-encrypted (ClearKey) MP4.
   */
  async open(source, opts = {}) {
    const { autoplay = true, startTime, subtitles, options = [], decryptionKey } = opts;
    checkOptions(options, 'open() options');
    if (decryptionKey != null && !/^[0-9a-f]{32}$/i.test(decryptionKey)) {
      throw new Error('open(): decryptionKey must be 32 hex digits (a 128-bit ClearKey/CENC key)');
    }
    const mrl = await this.vlc._mount(source, opts.name);
    const previous = this._mrls;
    this._mrls = [mrl];
    const media = [...options];
    if (startTime) media.push(`:start-time=${startTime}`);
    // Common Encryption (cenc, AES-CTR) with a known key: FFmpeg's MP4 demuxer
    // decrypts; VLC's own does not.
    if (decryptionKey) media.push(':demux=avformat', `:avformat-options={decryption_key=${decryptionKey}}`);
    this.duration = 0;
    this.tracks = [];
    this._position = 0;
    this._setTime(0, { snap: true });
    // Track and chapter lists fetched for the previous file can still be on
    // their way back: they are dropped by generation (_refreshTracks/_refreshChapters).
    this._mediaGen = (this._mediaGen ?? 0) + 1;
    // So are clock points: none counts until this file reports it is opening,
    // or (replacing a file while playing, where VLC stays 'playing') until its
    // tracks or length arrive -- the old file's last points can still follow
    // the media-changed event.
    this._staleTime = true;
    this.chapters = { titles: [], chapters: [], title: -1, chapter: -1 };
    // A new file must not show the last picture of the previous one (an audio
    // file draws nothing that would cover it).
    this.renderer?.clear();
    // If VLC's own demuxer finds no stream, or nothing it found could be
    // decoded, open() tries once more with FFmpeg's (see STOPPING) -- unless
    // the caller chose a demuxer, or this is a transcode.
    this._sawStreams = false;
    this._outputAtOpen = this._outputCount();
    this._retry = media.some((o) => /^:?(demux|sout)=/.test(o)) ? null : { mrl, media, autoplay };
    await this._call('open', { s: [mrl, media.join('\n')] });
    for (const m of previous) this.vlc._unmount(m);
    if (autoplay) await this.play();
    if (subtitles) await this.addSubtitles(subtitles);
    return this;
  }

  /** Must run inside a user gesture the first time, or the browser keeps audio suspended. */
  async play() {
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume().catch(() => {});
    if (this.state === 'paused') return this._call('set_pause', { i: [0, 0] });
    const { i } = await this._call('play');
    if (i !== 0) throw new Error('play() failed: nothing opened or the source is unreadable');
  }

  pause() { return this._call('set_pause', { i: [0, 1] }); }

  togglePause() { return this.state === 'playing' ? this.pause() : this.play(); }

  stop() { return this._call('stop'); }

  /**
   * @param {number} seconds
   * @param {{ fast?: boolean }} [opts] fast = nearest keyframe
   */
  seek(seconds, { fast = false } = {}) {
    this._setTime(Math.max(0, seconds), { snap: true });
    this.emit('timeupdate', this.currentTime);
    return this._call('set_time', { d: [Math.max(0, seconds) * 1e6], i: [0, fast ? 1 : 0] });
  }

  /** Seeks to a fraction of the duration, 0..1; works when the duration is unknown. */
  seekToPosition(pos, { fast = false } = {}) {
    return this._call('set_position', { d: [pos], i: [0, fast ? 1 : 0] });
  }

  /** Steps one frame forward (pauses first). */
  nextFrame() { return this._call('next_frame'); }

  /** Seconds, interpolated between VLC's position updates for smooth UIs. */
  /**
   * Seconds, for a playhead. VLC's clock reports a point every few hundred ms,
   * and each arrives a little late, so jumping to it would jerk the playhead
   * back and forth. Between points the time advances at the playback rate
   * and eases toward the clock, never backwards while playing; a seek or a
   * jump of more than half a second is followed at once.
   */
  get currentTime() {
    if (this.state !== 'playing') return this._time;
    const now = performance.now();
    // VLC sends a point every 100 ms while the clock runs. Past the last one by
    // more than a moment, the clock has stalled (buffering, or the end of the
    // file): hold rather than run on and then snap back.
    const target = this._time + (Math.min(now - this._timeAt, 400) / 1000) * this._rate;
    if (this._shown == null || Math.abs(target - this._shown) > 0.5) {
      this._shown = target;
    } else {
      const dt = Math.max(0, (now - this._shownAt) / 1000);
      const free = this._shown + dt * this._rate;
      this._shown = Math.max(this._shown, free + (target - free) * Math.min(1, dt * 4));
    }
    this._shownAt = now;
    return this.duration ? Math.min(this._shown, this.duration) : this._shown;
  }

  /**
   * 0..1 through the media, as VLC last reported it. Known even when the
   * duration is not (VLC falls back to the read position): a PlayStation STR
   * or a C64 tune still has one.
   */
  get position() { return this._position ?? 0; }

  set currentTime(s) { this.seek(s).catch(() => {}); }

  get paused() { return this.state !== 'playing'; }

  get rate() { return this._rate; }
  // Setters cannot return the promise: failures (a destroyed player) are dropped.
  set rate(r) { this._call('set_rate', { d: [r] }).catch(() => {}); }

  get volume() { return this._volume; }
  set volume(v) {
    this._volume = Math.max(0, Math.min(2, v));
    this._call('set_volume', { i: [0, Math.round(this._volume * 100)] }).catch(() => {});
    // VLC 4 only reports volume changes from a running audio output, so
    // reflect the request immediately rather than waiting on it.
    this.emit('volumechange', { volume: this._volume, muted: this._muted });
  }

  get muted() { return this._muted; }
  set muted(m) {
    this._muted = !!m;
    this._call('set_mute', { i: [0, m ? 1 : 0] }).catch(() => {});
    this.emit('volumechange', { volume: this._volume, muted: this._muted });
  }

  /** @param {string|{id: string}} track */
  selectTrack(track) {
    const id = typeof track === 'string' ? track : track.id;
    const t = this.tracks.find((x) => x.id === id);
    return this._call('select_track', { i: [0, TRACK_TYPE[t?.type] ?? 0], s: [id] });
  }

  /** Turns off every track of a type, e.g. `disableTrack('text')` hides subtitles. */
  disableTrack(type) {
    return this._call('select_track', { i: [0, TRACK_TYPE[type]], s: [null] });
  }

  /** Loads an external subtitle file (srt, ass, vtt, sub/idx, ...) and selects it. */
  async addSubtitles(source, { select = true } = {}) {
    const mrl = await this.vlc._mount(source);
    this._mrls.push(mrl);
    const { i } = await this._call('add_slave', { i: [0, 0, select ? 1 : 0], s: [mrl] });
    if (i !== 0) throw new Error('could not add subtitles');
  }

  /** Loads an external audio track (e.g. a commentary) alongside the video. */
  async addAudioTrack(source, { select = false } = {}) {
    const mrl = await this.vlc._mount(source);
    this._mrls.push(mrl);
    await this._call('add_slave', { i: [0, 1, select ? 1 : 0], s: [mrl] });
  }

  /** Subtitle delay in seconds (positive = later). */
  setSubtitleDelay(s) { return this._call('set_spu_delay', { d: [s * 1e6] }); }

  /** Audio delay in seconds (positive = later). */
  setAudioDelay(s) { return this._call('set_audio_delay', { d: [s * 1e6] }); }

  setChapter(index) { return this._call('set_chapter', { i: [0, index] }); }
  /** Plays title `index` of `player.chapters.titles` (DVD titles, or editions in some MKVs). */
  setTitle(index) { return this._call('set_title', { i: [0, index] }); }

  /**
   * Display aspect ratio of the picture on screen (pixel shape, forced
   * aspect ratio and crop included), or null before the first frame. Size
   * your container by it to avoid bars.
   */
  get aspect() { return this.renderer?.width ? this.renderer.aspect : null; }

  /** Index of the title playing, -1 if the media has none. */
  get title() { return this.chapters.title; }
  /** Index of the chapter playing within the title, -1 if none. */
  get chapter() { return this.chapters.chapter; }
  /** True while a disc menu is on screen: navigate() and the mouse drive it. */
  get inMenu() { return !!this.chapters.titles[this.chapters.title]?.menu; }

  /** Goes to the disc's menu (the first menu title), if it has one. */
  async menu() {
    const i = this.chapters.titles.findIndex((t) => t.menu);
    if (i < 0) return false;
    await this.setTitle(i);
    return true;
  }

  /**
   * Reports pointer input over the picture to VLC, for UIs that draw it
   * themselves (attach() does this on its canvas). x, y are 0..1 over the
   * picture. Resolves false when there is no video to point at.
   * @param {'move'|'down'|'up'} type
   */
  async pointer(type, x, y) {
    const { i } = await this._call('mouse', { i: [0, { move: 0, down: 1, up: 2 }[type] ?? 0], d: [x, y] });
    return i === 0;
  }

  /** '16:9', '4:3', ... or null for the source's own. */
  setAspectRatio(ratio) { return this._call('set_aspect', { s: [ratio] }); }

  /**
   * @param {boolean|'auto'} enabled
   * @param {string} [mode] VLC's deinterlace mode: blend, bob, linear, x, yadif, yadif2x, phosphor, ivtc...
   */
  setDeinterlace(enabled, mode = 'yadif') {
    const v = enabled === 'auto' ? -1 : enabled ? 1 : 0;
    return this._call('set_deinterlace', { i: [0, v], s: [mode] });
  }

  /**
   * Picture adjustments, VLC's "adjust" filter. Values not given go back to
   * neutral (brightness/contrast/saturation/gamma 1, hue 0), so each call
   * describes the whole picture; `null` turns the filter off.
   * @param {{ brightness?: number, contrast?: number, saturation?: number, hue?: number, gamma?: number } | null} values
   */
  async setAdjust(values) {
    if (!values) return this._call('set_adjust', { i: [0, 0, 0] });
    const all = { brightness: 1, contrast: 1, saturation: 1, hue: 0, gamma: 1, ...values };
    for (const [k, v] of Object.entries(all))
      if (ADJUST[k]) await this._call('set_adjust', { i: [0, ADJUST[k]], d: [v] });
    await this._call('set_adjust', { i: [0, 0, 1] });
  }

  /**
   * @param {string|number|null} preset a name from `vlc.equalizerPresets()` or its index; null = off
   */
  async setEqualizer(preset, { preamp } = {}) {
    let idx = preset;
    if (typeof preset === 'string') {
      const { presets } = await this.vlc.equalizerPresets();
      idx = presets.findIndex((p) => p.toLowerCase() === preset.toLowerCase());
      if (idx < 0) throw new Error(`unknown equalizer preset "${preset}"`);
    }
    return this._call('set_equalizer', { i: [0, idx ?? -1, preamp != null ? 1 : 0], d: [preamp ?? 0] });
  }

  /**
   * Queues a source to start the moment the current one ends, with no gap
   * (VLC 4's next-media). `null` clears the queue.
   */
  async queue(source, opts = {}) {
    if (source == null) return this._call('set_next', { s: [null] });
    const mrl = await this.vlc._mount(source, opts.name);
    this._mrls.push(mrl);
    return this._call('set_next', { s: [mrl] });
  }

  /** Loops between two times in seconds; `setABLoop(null)` stops looping. */
  setABLoop(a, b) {
    if (a == null) return this._call('set_abloop', { d: [-1, -1] });
    return this._call('set_abloop', { d: [a * 1e6, b * 1e6] });
  }

  /** Programs of a multi-program stream (DVB/ATSC transport streams). */
  async programs() {
    const { value } = await this._call('programs', {}, 'json');
    return value ?? [];
  }

  selectProgram(id) { return this._call('select_program', { i: [0, id] }); }

  /** Steps one frame back (VLC 4 keeps a small buffer of decoded frames). */
  previousFrame() { return this._call('previous_frame'); }

  /** DVD-style menu navigation: 'activate' | 'up' | 'down' | 'left' | 'right' | 'popup'. */
  navigate(action) {
    const n = { activate: 0, up: 1, down: 2, left: 3, right: 4, popup: 5 }[action];
    return this._call('navigate', { i: [0, n ?? 0] });
  }

  /** Shows a teletext page (e.g. 100); 0 hides it. */
  setTeletext(page, { transparent } = {}) {
    return this._call('set_teletext', { i: [0, page, transparent == null ? -1 : transparent ? 1 : 0] });
  }

  /**
   * VLC's marquee: text drawn over the video. `null` hides it.
   * @param {{ text: string, color?: number, opacity?: number, position?: number, size?: number,
   *           timeout?: number, x?: number, y?: number, refresh?: number } | null} m
   *   color is 0xRRGGBB, opacity 0..255, position VLC's (0 center, 1 left, 2 right, 4 top, 8 bottom, sums),
   *   timeout ms (0 = forever); text accepts VLC's time format codes, e.g. "%H:%M:%S".
   */
  async setMarquee(m) {
    if (!m) return this._call('marquee', { i: [0, 0, 0] });
    const ints = { color: 2, opacity: 3, position: 4, refresh: 5, size: 6, timeout: 7, x: 8, y: 9 };
    await this._call('marquee', { i: [0, 1], s: [m.text ?? ''] });
    for (const [k, id] of Object.entries(ints)) if (m[k] != null) await this._call('marquee', { i: [0, id, m[k]] });
    return this._call('marquee', { i: [0, 0, 1] });
  }

  /**
   * VLC's logo filter: an image over the video. `null` hides it.
   * @param {{ image: Blob|File|string, x?: number, y?: number, opacity?: number, position?: number } | null} l
   */
  async setLogo(l) {
    if (!l) return this._call('logo', { i: [0, 0, 0] });
    const mrl = await this.vlc._mount(l.image, 'logo.png');
    this._mrls.push(mrl);
    await this._call('logo', { i: [0, 1], s: [decodeURIComponent(mrl.replace(/^file:\/\//, ''))] });
    const ints = { x: 2, y: 3, opacity: 6, position: 7 };
    for (const [k, id] of Object.entries(ints)) if (l[k] != null) await this._call('logo', { i: [0, id, l[k]] });
    return this._call('logo', { i: [0, 0, 1] });
  }

  /** 'stereo' | 'reverse' | 'left' | 'right' | 'dolby' | 'mono' (VLC's stereo mode). */
  setStereoMode(mode) {
    const n = { unset: 0, stereo: 1, rstereo: 2, reverse: 2, left: 3, right: 4, dolby: 5, dolbys: 5, mono: 7 }[mode] ?? 0;
    return this._call('set_stereomode', { i: [0, n] });
  }

  /** Scales subtitle text; 1 is normal. */
  setSubtitleScale(scale) { return this._call('set_spu_scale', { d: [scale] }); }

  /**
   * Crops the picture: `{ ratio: '16:9' }` (or `[16, 9]`), `{ window: [x, y, w, h] }`,
   * `{ border: [left, right, top, bottom] }`, or `null` for none.
   */
  setCrop(c) {
    if (!c) return this._call('set_crop', { i: [0, 0] });
    // A ratio may be given as '16:9' (like setAspectRatio) or [16, 9].
    const ratio = typeof c.ratio === 'string' ? c.ratio.split(/[:/]/).map(Number) : c.ratio;
    if (ratio) return this._call('set_crop', { i: [0, 1, ...ratio] });
    if (c.window) return this._call('set_crop', { i: [0, 2, ...c.window] });
    if (c.border) return this._call('set_crop', { i: [0, 3, ...c.border] });
    throw new TypeError('setCrop expects { ratio }, { window } or { border }');
  }

  /**
   * Records the stream being played (as-is, no re-encoding) until stopRecording().
   * @returns {Promise<void>}
   */
  startRecording() {
    if (!this.vlc.features?.sout) {
      return Promise.reject(new Error('recording needs the stream-output engine: createVLC({ engine: sout }) with libvlc-wasm-sout'));
    }
    this._recording = new Promise((resolve) => { this._recordingDone = resolve; });
    return this._call('record', { i: [0, 1], s: ['/recordings'] });
  }

  /**
   * @param {{ timeout?: number }} [opts] ms to wait for VLC to close the file (default 10000)
   * @returns {Promise<File>} the recorded file
   */
  async stopRecording({ timeout = 10000 } = {}) {
    if (!this._recording) throw new Error('not recording');
    const recording = this._recording;
    this._recording = null;
    let timer;
    try {
      await this._call('record', { i: [0, 0], s: ['/recordings'] });
      // VLC names the file when it closes it; if that event never comes
      // (nothing was written, or the player went away) give up.
      const path = await Promise.race([recording, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`stopRecording: no file from VLC after ${timeout} ms`)), timeout);
      })]);
      const { name, data } = await this.vlc._rpc('takeFile', { path });
      return new File([data], name);
    } finally {
      clearTimeout(timer);
      this._recordingDone = null;
    }
  }

  /** Metadata, tracks and VLC's input/decoder statistics for the current media. */
  async info() {
    const { value } = await this._call('media_info', {}, 'json');
    return value;
  }

  /** Playback counters from VLC plus what the page actually drew. */
  async stats() {
    const [{ value: status }, info] = await Promise.all([this._call('status', {}, 'json'), this.info()]);
    return { ...status, ...info?.stats, framesDrawn: this.renderer?.framesDrawn ?? 0, audioFramesPlayed: this.audioFramesPlayed ?? 0 };
  }

  /** The frame on screen as an image. */
  async snapshot(type = 'image/png', quality) {
    const c = this.canvas;
    if (!c) throw new Error('no canvas attached');
    if (c.convertToBlob) return c.convertToBlob({ type, quality });
    return new Promise((res) => c.toBlob(res, type, quality));
  }

  /** Releases the player; safe to call more than once (later calls share the first's promise). */
  destroy() {
    // Taken synchronously so nothing issued from here on reaches a player
    // that is being released.
    const ptr = this.ptr;
    this.ptr = 0;
    this._destroying ??= (async () => {
      cancelAnimationFrame(this._raf);
      clearTimeout(this._pendingTracks);
      this._unlistenPointer?.();
      this._wakeLock(false);
      this.renderer?.destroy();
      this.renderer = null;
      this.audioNode?.port.postMessage({ type: 'detach' });
      this.audioNode?.disconnect();
      if (this._ownsContext) await this.audioContext?.close().catch(() => {});
      if (ptr) {
        await this.vlc._call('stop', { i: [ptr] }).catch(() => {});
        await this.vlc._call('player_release', { i: [ptr] }).catch(() => {});
      }
      for (const m of this._mrls) this.vlc._unmount(m);
      this.vlc._players.delete(this.id);
      this.emit('destroy');
      this._clearHandlers();
    })();
    return this._destroying;
  }

  /** Slot i[0] is always the player; callers pass a placeholder 0 there. */
  _call(name, args = {}, ret) {
    if (!this.ptr) return Promise.reject(new Error('player destroyed'));
    if (args.i?.length && args.i[0] !== 0) return Promise.reject(new Error(`internal: ${name} must leave i[0] for the player`));
    const i = [this.ptr, ...(args.i ?? []).slice(1)];
    return this.vlc._call(name, { ...args, i }, ret);
  }

  /** A clock point from VLC; { snap } for a seek, so the playhead jumps rather than eases. */
  _setTime(t, { snap = false } = {}) {
    this._time = t;
    this._timeAt = performance.now();
    if (snap) this._shown = null;
  }

  /** Pictures shown plus audio frames written, from the shared counters: 0 change = nothing decoded. */
  _outputCount() {
    const mem = this.vlc._memory;
    const shown = Atomics.load(new Int32Array(mem, this.videoPtr + VIDEO.DISPLAYED * 4, 1), 0);
    const written = Atomics.load(new Int32Array(mem, this.ringPtr + RING.WRITE * 4, 1), 0);
    return (shown + written) >>> 0;
  }

  /**
   * VLC's demuxer found no stream in the file (a DTS transport stream), or
   * nothing it found could be decoded (Ut Video in AVI): open it again with
   * FFmpeg's demuxer, once.
   */
  async _retryWithFFmpeg() {
    const { mrl, media, autoplay } = this._retry;
    this._retry = null;
    try {
      await this._call('open', { s: [mrl, [...media, ':demux=avformat'].join('\n')] });
      if (autoplay) await this.play();
    } catch (e) {
      this.emit('error', e);
    }
  }

  async _refreshTracks() {
    const gen = this._mediaGen;
    const { value } = await this._call('tracks', {}, 'json');
    if (gen !== this._mediaGen) return;
    this.tracks = value ?? [];
    const v = this.tracks.find((t) => t.type === 'video' && t.selected);
    // The renderer takes the SAR from the video output; this only covers the
    // moment before the first frame.
    if (this.renderer && !this.renderer.width) this.renderer.sar = v?.sarNum && v?.sarDen ? v.sarNum / v.sarDen : 1;
    this.emit('tracks', this.tracks);
  }

  async _refreshChapters() {
    const gen = this._mediaGen;
    const { value } = await this._call('chapters', {}, 'json');
    if (gen !== this._mediaGen) return;
    this.chapters = value ?? { titles: [], chapters: [], title: -1, chapter: -1 };
    // VLC's Matroska demuxer prefixes chapter names with a space.
    for (const c of [...this.chapters.titles, ...this.chapters.chapters]) c.name = c.name?.trim() ?? null;
    this.emit('chapters', this.chapters);
  }

  /** @internal called by VLC for each bridge event addressed to this player */
  _onEvent(type, a, b, str) {
    switch (type) {
      case EVENT.STATE: {
        const prev = this.state;
        this.state = STATE_NAMES[a] ?? 'idle';
        this._wakeLock(this.state === 'playing' && this.opts.keepAwake !== false);
        if (this.state === 'playing') this._timeAt = performance.now();
        if (this.state === 'paused') this._setTime(this._currentTimeAt(prev));
        // Like <video>, keep the last picture when the media ended by itself.
        if (this.state === 'stopped' && !this._ended) this.renderer?.clear();
        if (this.state === 'opening' || this.state === 'playing') this._staleTime = false;
        if (this.state === 'opening') this._ended = false;
        this.emit('statechange', this.state);
        this.emit(this.state);
        break;
      }
      case EVENT.POSITION:
        if (this._staleTime) break;
        this._position = b;
        this._setTime(a / 1e6);
        break;
      case EVENT.LENGTH:
        this._staleTime = false;
        this.duration = a / 1e6;
        this.emit('durationchange', this.duration);
        break;
      case EVENT.BUFFERING: this.emit('buffering', a); break;
      case EVENT.RATE: this._rate = a; this.emit('ratechange', a); break;
      case EVENT.CAPS: this.seekable = !!(a & 1); this.emit('capabilities', { seekable: !!(a & 1), pausable: !!(a & 2) }); break;
      case EVENT.TRACKS:
        this._sawStreams = true;
        this._staleTime = false;
        // fall through
      case EVENT.TRACK_SELECTED:
        // A file with many tracks announces them one by one; refetch once.
        clearTimeout(this._pendingTracks);
        this._pendingTracks = setTimeout(() => this._refreshTracks().catch(() => {}), 30);
        break;
      case EVENT.TITLES:
        this._refreshChapters().catch(() => {});
        break;
      case EVENT.CHAPTER: {
        // Named from the refreshed list: VLC's own name can be a stale pointer (bridge.c on_chapter).
        const gen = this._mediaGen;
        this._refreshChapters().then(() => {
          if (gen === this._mediaGen) this.emit('chapterchange', { title: a, chapter: b, name: this.chapters.chapters[b]?.name ?? null });
        }, () => {});
        break;
      }
      case EVENT.STOPPING:
        if (STOP_REASON[a] !== 'user' && this._retry &&
            (!this._sawStreams || this._outputCount() === this._outputAtOpen)) {
          this._retryWithFFmpeg();
          break;
        }
        this._ended = STOP_REASON[a] === 'ended';
        if (this._ended) this.emit('ended');
        if (STOP_REASON[a] === 'error') this.emit('error', new Error('VLC could not play this media (see the log)'));
        break;
      case EVENT.VOLUME: this._volume = a; this.emit('volumechange', { volume: a, muted: this._muted }); break;
      case EVENT.MUTE: this._muted = !!a; this.emit('volumechange', { volume: this._volume, muted: !!a }); break;
      case EVENT.META: this.emit('meta'); break;
      case EVENT.PARSED: this.emit('parsed'); break;
      case EVENT.VOUT: this.emit('vout', a); break;
      case EVENT.MEDIA_CHANGED: this.emit('mediachange'); break;
      case EVENT.RECORDING:
        this.emit('recording', { recording: !!a, path: str });
        if (!a && str) this._recordingDone?.(str);
        break;
      case EVENT.PROGRAMS: this.emit('programs'); break;
      case EVENT.FRAME_STEP: this.emit('framestep', a); break;
      default: break;
    }
  }

  /** Keeps the screen on while video plays, as VLC's inhibit module does on desktop. */
  async _wakeLock(on) {
    try {
      if (on && !this._lock && typeof navigator !== 'undefined' && navigator.wakeLock) {
        this._lock = await navigator.wakeLock.request('screen');
        this._lock.addEventListener('release', () => { this._lock = null; });
      } else if (!on && this._lock) {
        await this._lock.release();
        this._lock = null;
      }
    } catch { /* not visible, or denied: nothing to do */ }
  }

  /** @internal the interpolated time as of a state change away from `prevState` */
  _currentTimeAt(prevState) {
    if (prevState !== 'playing') return this._time;
    return this._time + ((performance.now() - this._timeAt) / 1000) * this._rate;
  }
}

const workletLoaded = new WeakMap();
