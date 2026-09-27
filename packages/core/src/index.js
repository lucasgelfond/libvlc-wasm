// libvlc-wasm: VLC's engine in the browser.
//
//   const vlc = await createVLC();
//   const player = await vlc.createPlayer({ canvas });
//   await player.open(file);
//
// The wasm instance lives in a dedicated Worker; this module is the page-side
// client. See README.md for the full API.
import { Emitter } from './emitter.js';
import { Player } from './player.js';
import { EVENT, LOG_LEVELS, checkOptions } from './engine.js';

export { Player };
/** VLC's player states by number, as `stats().state` reports them. */
export { STATE_NAMES } from './engine.js';

const LEVEL_NAMES = ['debug', 'debug', 'info', 'warn', 'error'];

/**
 * @typedef {object} VLCOptions
 * @property {number} [threads] pthreads started up front. VLC and FFmpeg start
 *   threads per stream; a pre-started pool keeps playback from waiting on
 *   worker startup. Default: 20.
 * @property {'debug'|'info'|'warn'|'error'|'off'} [logLevel] default 'warn'
 * @property {number} [decoderThreads] FFmpeg threads per decoder (default min(cores, 4))
 * @property {string[]} [args] extra libvlc_new() arguments, e.g. ['--deinterlace=1']
 * @property {string|URL} [wasmUrl] where libvlc.wasm is served, if not next to libvlc.js
 * @property {string|URL} [workerUrl] override the worker script (bundlers normally resolve it)
 * @property {{ moduleUrl: string|URL, wasmUrl?: string|URL }} [engine] another build of VLC to
 *   run, e.g. `import sout from 'libvlc-wasm-sout'` for transcode(), remuxing and recording.
 * @property {string|URL} [moduleUrl] load the engine from this libvlc*.js instead (self-hosting).
 * @property {string|URL} [soundfont] a General MIDI .sf2 file; without one, .mid files
 *   do not play (VLC synthesises MIDI with FluidSynth). Fetched once at startup.
 * @property {(string|URL)[]|false} [fonts] font files for subtitles; the first is the
 *   default face. Default: the bundled Noto Sans. `false` skips fonts (no subtitles).
 */

/**
 * Loads the engine. Requires a cross-origin isolated page (COOP/COEP
 * headers): VLC's threads need SharedArrayBuffer.
 * @param {VLCOptions} [opts]
 * @returns {Promise<VLC>}
 */
export async function createVLC(opts = {}) {
  if (!globalThis.crossOriginIsolated) {
    throw new Error(
      'libvlc-wasm needs a cross-origin isolated page for SharedArrayBuffer. Serve it with\n' +
      '  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n' +
      '(see README: "Serving").',
    );
  }
  const vlc = new VLC(opts);
  await vlc._start();
  return vlc;
}

export class VLC extends Emitter {
  /** @internal */
  constructor(opts) {
    super();
    this.opts = opts;
    this._players = new Map();
    this._pending = new Map();
    this._seq = 0;
    this._nextPlayer = 1;
    this._timers = new Set();
    this._urls = {
      worklet: new URL('./audio-worklet.js', import.meta.url).href,
    };
  }

  async _start() {
    const t0 = performance.now();
    // Bundlers find and emit the worker from the literal new Worker(new URL())
    // form, so it stays literal. Loaded from another origin (a CDN), the SDK
    // cannot start a Worker from there: start it from a same-origin blob that
    // imports the script instead.
    const own = new URL('./worker.js', import.meta.url);
    this.worker = this.opts.workerUrl
      ? new Worker(this.opts.workerUrl, { type: 'module' })
      : own.origin === globalThis.location?.origin || own.protocol === 'blob:'
        ? new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'libvlc' })
        : new Worker(URL.createObjectURL(new Blob([`import ${JSON.stringify(own.href)};`], { type: 'text/javascript' })),
          { type: 'module', name: 'libvlc' });
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => this.emit('error', e);
    // VLC runs ~8 threads per playing file (input, decoders, vout, aout, clock,
    // preparser) plus FFmpeg's; starting a pthread later costs a Worker boot
    // and a module instantiation, which stalls playback start.
    const threads = this.opts.threads ?? 20;
    const logLevel = LOG_LEVELS[this.opts.logLevel ?? 'warn'] ?? 3;
    const fonts = this.opts.fonts === false ? []
      : (this.opts.fonts ?? [new URL('../fonts/NotoSans-Regular.ttf', import.meta.url)]).map(String);
    if (this.opts.variant === 'sout' && !this.opts.engine) {
      throw new Error("The transcoding engine is its own package now: npm i libvlc-wasm-sout, then\n" +
        "  import sout from 'libvlc-wasm-sout';\n  const vlc = await createVLC({ engine: sout });");
    }
    // Another engine (the sout build, or a self-hosted copy) is loaded by URL,
    // so bundlers only ship it to apps that import it.
    const engine = this.opts.engine;
    const moduleUrl = engine?.moduleUrl ? String(engine.moduleUrl)
      : this.opts.moduleUrl ? String(this.opts.moduleUrl) : undefined;
    const wasmUrl = engine?.wasmUrl ?? this.opts.wasmUrl;
    const { version, layout, fonts: fontFiles, soundfont } = await this._rpc('init', {
      threads, fonts, moduleUrl,
      soundfont: this.opts.soundfont ? String(this.opts.soundfont) : undefined,
      wasmUrl: wasmUrl ? String(wasmUrl) : undefined,
    });
    const { features, ...v } = version;
    this.version = v;
    /** What this build can do: `{ sout }` (transcoding, remuxing, recording). */
    this.features = features ?? { sout: false };
    this._layout = layout;
    this._memory = await this._rpc('memory');
    this._instance = await this._rpc('instance', {
      args: checkOptions([
        '--no-video-title-show',
        // The player creates its audio output before our callbacks exist;
        // start it on the silent one so that first attempt does not log an error.
        '--aout=adummy',
        // FFmpeg frame threads each need a pthread from the pre-started pool.
        `--avcodec-threads=${this.opts.decoderThreads ?? Math.min(navigator.hardwareConcurrency || 4, 4)}`,
        ...(fontFiles.length ? [`--freetype-font=${fontFiles[0]}`, '--ssa-fontsdir=/fonts'] : []),
        ...(soundfont ? [`--soundfont=${soundfont}`] : []),
        ...(this.opts.args ?? []),
      ], 'args'),
      logLevel,
    });
    /** Milliseconds from createVLC() to ready (worker, wasm compile, pthreads, libvlc_new). */
    this.startupMs = performance.now() - t0;
  }

  /**
   * @param {{ canvas?: HTMLCanvasElement|OffscreenCanvas, fit?: 'contain'|'cover'|'fill',
   *           audio?: boolean, audioContext?: AudioContext, audioDestination?: AudioNode }} [opts]
   *   audio: false plays silently without creating an AudioContext.
   * @returns {Promise<Player>}
   */
  async createPlayer(opts = {}) {
    const id = this._nextPlayer++;
    const p = new Player(this, id, opts);
    this._players.set(id, p);
    try {
      return await p._init();
    } catch (e) {
      this._players.delete(id);
      throw e;
    }
  }

  /**
   * Reads a file's container, tracks and metadata without playing it —
   * like ffprobe or exiftool, through VLC's own demuxers.
   * @param {File|Blob|ArrayBuffer|Uint8Array|string} source
   * @returns {Promise<{ duration?: number, meta: Record<string,string>, tracks: object[], status: number }>}
   */
  async probe(source, { timeout = 10000 } = {}) {
    const mrl = await this._mount(source);
    let timer;
    try {
      // VLC's preparser has been seen to stall (about 1 in 100 in WebKit);
      // give up rather than hang. A late answer is dropped.
      const { i, value } = await Promise.race([
        this._call('parse', { i: [this._instance], s: [mrl] }, 'json'),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`probe timed out after ${timeout} ms`)), timeout); }),
      ]);
      if (i !== 0 && !value?.tracks?.length) throw new Error('VLC could not parse this source');
      return value;
    } finally {
      clearTimeout(timer);
      this._unmount(mrl);
    }
  }

  /**
   * Decodes one frame and returns it as a JPEG.
   * @param {File|Blob|ArrayBuffer|Uint8Array|string} source
   * @param {{ time?: number, position?: number, width?: number, height?: number,
   *           crop?: boolean, fast?: boolean }} [opts] time in seconds, or position
   *   0..1 (default 0.1); width/height 0 keeps the aspect ratio; fast seeks to
   *   the nearest keyframe.
   * @returns {Promise<{ blob: Blob, width: number, height: number }>}
   */
  async thumbnail(source, opts = {}) {
    const { time, position = 0.1, width = 320, height = 0, crop = false, fast = true } = opts;
    const mrl = await this._mount(source);
    try {
      const { i: size, d: dims, value } = await this._call('thumbnail', {
        i: [this._instance, width, height, crop ? 1 : 0, fast ? 1 : 0],
        d: [time ?? -1, position],
        s: [mrl],
      }, 'bytes');
      if (size <= 0 || !value) throw new Error('VLC could not decode a frame from this source');
      return { blob: new Blob([value], { type: 'image/jpeg' }), width: Math.floor(dims / 65536), height: dims % 65536 };
    } finally {
      this._unmount(mrl);
    }
  }

  /**
   * Converts media with VLC's stream output. Needs the libvlc-wasm-sout engine: `createVLC({ engine: sout })`.
   *
   * @param {File|Blob|ArrayBuffer|Uint8Array|string} source
   * @param {{ to?: 'webm'|'mkv'|'mp4'|'ogg'|'ts'|'wav'|'mp3',
   *           remux?: boolean, video?: string|false, audio?: string|false,
   *           videoBitrate?: number, audioBitrate?: number, width?: number, height?: number,
   *           name?: string, onProgress?: (fraction: number) => void }} [opts]
   *   `remux` copies the streams into the new container without re-encoding (fast,
   *   lossless). Otherwise defaults are browser-playable: WebM = VP8 + Opus,
   *   MP4 = H.264 + AAC. `video`/`audio` take VLC codec names ('h264', 'hevc', 'VP80',
   *   'VP90', 'mp4v', 'mjpg', 'opus', 'mp4a', 'mpga', 'flac', 's16l') or false to drop
   *   the stream.
   * @returns {Promise<File>}
   */
  async transcode(source, opts = {}) {
    if (!this.features.sout) {
      throw new Error("transcode() needs the stream-output engine: import sout from 'libvlc-wasm-sout', then createVLC({ engine: sout })");
    }
    const to = opts.to ?? 'webm';
    const MUX = { webm: 'avformat{mux=webm}', mkv: 'mkv', mp4: 'mp4', ogg: 'ogg', ts: 'ts', wav: 'wav', mp3: 'dummy' };
    const DEFAULTS = {
      webm: ['VP80', 'opus'], mkv: ['VP80', 'opus'], mp4: ['h264', 'mp4a'], ogg: [false, 'opus'],
      ts: ['mp2v', 'mpga'], wav: [false, 's16l'], mp3: [false, 'mp3'],
    };
    // Encoders named outright, so VLC does not first try FFmpeg's (absent) ones.
    // x264/x265 run without SIMD in wasm: their fastest presets keep a
    // transcode near real time instead of several times slower.
    const ENCODERS = {
      VP80: 'vpx', VP90: 'vpx',
      h264: 'x264{preset=veryfast}', hevc: 'x265',
    };
    if (!MUX[to]) throw new Error(`unknown container "${to}"`);
    const base = (opts.name ?? (source?.name ?? 'output').replace(/\.[^.]+$/, '')).replace(/[^\w.-]+/g, '_');
    const dst = `/out/${base}-${Date.now().toString(36)}.${to}`;
    const [dv, da] = DEFAULTS[to];
    const v = opts.video === undefined ? dv : opts.video;
    const a = opts.audio === undefined ? da : opts.audio;
    let chain;
    if (opts.remux) {
      chain = `#std{access=file,mux=${MUX[to]},dst=${dst}}`;
    } else {
      const parts = [];
      if (v) parts.push(`vcodec=${v}`, ...(ENCODERS[v] ? [`venc=${ENCODERS[v]}`] : []), `vb=${opts.videoBitrate ?? 2000}`,
        ...(opts.width ? [`width=${opts.width}`] : []), ...(opts.height ? [`height=${opts.height}`] : []));
      if (a) parts.push(`acodec=${a}`, `ab=${opts.audioBitrate ?? 128}`, 'channels=2', ...(a === 'opus' ? ['samplerate=48000'] : []));
      chain = `#transcode{${parts.join(',')}}:std{access=file,mux=${MUX[to]},dst=${dst}}`;
    }
    // Streams asked to be dropped (or with no codec for the container) stay out.
    const drop = [...(!opts.remux && !v ? [':no-sout-video'] : []), ...(!opts.remux && !a ? [':no-sout-audio'] : [])];
    const input = opts.remux ? null : await this.probe(source).catch(() => null);
    const player = await this.createPlayer({ audio: false, keepAwake: false });
    try {
      const done = new Promise((resolve, reject) => {
        player.on('ended', resolve);
        player.on('error', reject);
        player.on('destroy', () => reject(new Error('transcode: VLC was destroyed')));
      });
      done.catch(() => {}); // settled after an early throw below, when nobody awaits it
      const progress = opts.onProgress
        ? setInterval(() => player.stats()
          .then((s) => opts.onProgress(Math.max(0, Math.min(1, s.position))))
          .catch(() => {}), 250)
        : 0;
      if (progress) this._timers.add(progress);
      try {
        // Frame-threaded FFmpeg decoding feeding the transcoder races at the
        // end of the stream (a wasm OOB in about 1 run in 3, RealVideo 4 in
        // WebKit); playback does not. Encoding dominates here anyway. It has
        // to be set on the player: the transcoder's decoders hang off the sout
        // chain, which a media option (on the input) never reaches.
        await player._call('set_int_option', { i: [0, 1], s: ['avcodec-threads'] });
        // A stream's encoder opens on its first decoded frame, and most
        // muxers cannot add a stream once the header is out: give late
        // streams (RealMedia's audio, say) longer than the default 1.5 s.
        await player._call('set_int_option', { i: [0, 5000], s: ['sout-mux-caching'] });
        await player.open(source, { options: [`:sout=${chain}`, ':no-sout-all', ...drop], name: opts.name });
        await done;
      } finally {
        clearInterval(progress);
        this._timers.delete(progress);
      }
    } finally {
      // Releasing the player tears the sout chain down, which is when muxers
      // that index at the end (MP4's moov, MKV's cues) finish the file.
      await player.destroy();
    }
    const { name, data } = await this._rpc('takeFile', { path: dst });
    const TYPES = { webm: 'video/webm', mkv: 'video/x-matroska', mp4: 'video/mp4', ogg: 'audio/ogg', ts: 'video/mp2t', wav: 'audio/wav', mp3: 'audio/mpeg' };
    const file = new File([data], name, { type: TYPES[to] });
    // VLC drops a stream it has no encoder for and carries on; say so instead
    // of handing back a file that is silently missing its video.
    if (!opts.remux && input) {
      const kinds = (info) => new Set(info?.tracks.map((t) => t.type));
      const out = await this.probe(file).catch(() => null);
      const had = kinds(input), got = kinds(out);
      for (const [kind, codec] of [['video', v], ['audio', a]]) {
        if (out && codec && had.has(kind) && !got.has(kind)) {
          throw new Error(`transcode: VLC could not encode ${kind} as "${codec}" into ${to} (see the 'log' event)`);
        }
      }
    }
    opts.onProgress?.(1);
    return file;
  }

  /** The equalizer presets and band frequencies VLC ships. */
  async equalizerPresets() {
    this._eq ??= this._call('equalizer_presets', {}, 'json').then((r) => r.value);
    return this._eq;
  }

  /** Changes how much of VLC's log reaches the 'log' event. */
  setLogLevel(level) {
    return this._call('set_log_level', { i: [this._instance, LOG_LEVELS[level] ?? 3] });
  }

  /** Stops every player and terminates the worker. */
  async destroy() {
    for (const t of this._timers) clearInterval(t);
    this._timers.clear();
    await Promise.allSettled([...this._players.values()].map((p) => p.destroy()));
    // Stops the engine's timer; bounded, since a wedged worker is terminated anyway.
    await Promise.race([this._rpc('dispose').catch(() => {}), new Promise((r) => setTimeout(r, 500))]);
    this.worker.terminate();
    this._destroyed = true;
    // Nothing will answer now: settle whatever is still waiting.
    const err = new Error('VLC destroyed');
    for (const p of this._pending.values()) p.reject(err);
    this._pending.clear();
  }

  // --- internals ------------------------------------------------------------

  _rpc(method, args, transfer) {
    if (this._destroyed) return Promise.reject(new Error('VLC destroyed'));
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args }, transfer ?? []);
    });
  }

  /** @internal */
  _call(name, { i, d, s } = {}, ret) {
    return this._rpc('call', { name, i, d, s, ret });
  }

  /** @internal */
  async _mount(source, name) {
    if (typeof source === 'string' || source instanceof URL) {
      // Relative to the page, like <video src>; the worker would resolve it against itself.
      let url = String(source);
      try { url = new URL(url, globalThis.document?.baseURI ?? globalThis.location?.href).href; } catch { /* the worker says why */ }
      return this._rpc('mount', { source: url });
    }
    if (source instanceof Blob) return this._rpc('mount', { source });
    if (Array.isArray(source) && source.every((f) => f instanceof Blob)) return this._rpc('mount', { source });
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
      const bytes = source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      const copy = bytes.slice();
      return this._rpc('mount', { source: { name: name ?? 'media', data: copy.buffer } }, [copy.buffer]);
    }
    throw new TypeError('source must be a File, Blob, File[] (opened together, first is played), ArrayBuffer, typed array or URL string');
  }

  /** @internal */
  _unmount(mrl) { this._rpc('unmount', { mrl }).catch(() => {}); }

  /** @internal wasm memory grew: fetch the current SharedArrayBuffer */
  async _refreshMemory() {
    this._memory = await this._rpc('memory');
    for (const p of this._players.values()) {
      p.audioNode?.port.postMessage({ type: 'attach', memory: this._memory, ringPtr: p.ringPtr });
    }
  }

  _onMessage(msg) {
    if (msg.type === 'result') {
      const p = this._pending.get(msg.id);
      this._pending.delete(msg.id);
      if (msg.error) p?.reject(new Error(msg.error));
      else p?.resolve(msg.result);
      return;
    }
    if (msg.type === 'event') {
      if (msg.event === EVENT.LOG) {
        this.emit('log', { level: LEVEL_NAMES[msg.a] ?? 'info', message: msg.str });
        return;
      }
      this._players.get(msg.player)?._onEvent(msg.event, msg.a, msg.b, msg.str);
    }
  }
}
