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
import { EVENT } from './engine.js';

export { Player };

const LOG_LEVELS = { debug: 0, info: 2, notice: 2, warn: 3, warning: 3, error: 4, off: 99 };
const LEVEL_NAMES = ['debug', 'debug', 'info', 'warn', 'error'];

/**
 * @typedef {object} VLCOptions
 * @property {number} [threads] pthreads started up front. VLC and FFmpeg start
 *   threads per stream; a pre-started pool keeps playback from waiting on
 *   worker startup. Default: min(hardwareConcurrency, 8) + 4.
 * @property {'debug'|'info'|'warn'|'error'|'off'} [logLevel] default 'warn'
 * @property {number} [decoderThreads] FFmpeg threads per decoder (default min(cores, 4))
 * @property {string[]} [args] extra libvlc_new() arguments, e.g. ['--deinterlace=1']
 * @property {string|URL} [wasmUrl] where libvlc.wasm is served, if not next to libvlc.js
 * @property {string|URL} [workerUrl] override the worker script (bundlers normally resolve it)
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
    this._urls = {
      worklet: new URL('./audio-worklet.js', import.meta.url).href,
    };
  }

  async _start() {
    const t0 = performance.now();
    this.worker = this.opts.workerUrl
      ? new Worker(this.opts.workerUrl, { type: 'module' })
      : new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'libvlc' });
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => this.emit('error', e);
    // VLC runs ~8 threads per playing file (input, decoders, vout, aout, clock,
    // preparser) plus FFmpeg's; starting a pthread later costs a Worker boot
    // and a module instantiation, which stalls playback start.
    const threads = this.opts.threads ?? 20;
    const logLevel = LOG_LEVELS[this.opts.logLevel ?? 'warn'] ?? 3;
    const fonts = this.opts.fonts === false ? []
      : (this.opts.fonts ?? [new URL('../fonts/NotoSans-Regular.ttf', import.meta.url)]).map(String);
    const { version, layout, fonts: fontFiles, soundfont } = await this._rpc('init', {
      threads, fonts,
      soundfont: this.opts.soundfont ? String(this.opts.soundfont) : undefined,
      wasmUrl: this.opts.wasmUrl ? String(this.opts.wasmUrl) : undefined,
    });
    const { features, ...v } = version;
    this.version = v;
    /** What this build can do: `{ sout }` (transcoding, remuxing, recording). */
    this.features = features ?? { sout: false };
    this._layout = layout;
    this._memory = await this._rpc('memory');
    this._instance = await this._rpc('instance', {
      args: [
        '--no-video-title-show',
        // The player creates its audio output before our callbacks exist;
        // start it on the silent one so that first attempt does not log an error.
        '--aout=adummy',
        // FFmpeg frame threads each need a pthread from the pre-started pool.
        `--avcodec-threads=${this.opts.decoderThreads ?? Math.min(navigator.hardwareConcurrency || 4, 4)}`,
        ...(fontFiles.length ? [`--freetype-font=${fontFiles[0]}`, '--ssa-fontsdir=/fonts'] : []),
        ...(soundfont ? [`--soundfont=${soundfont}`] : []),
        ...(this.opts.args ?? []),
      ],
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
  async probe(source) {
    const mrl = await this._mount(source);
    try {
      const { i, value } = await this._call('parse', { i: [this._instance], s: [mrl] }, 'json');
      if (i !== 0 && !value?.tracks?.length) throw new Error('VLC could not parse this source');
      return value;
    } finally {
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
    await Promise.allSettled([...this._players.values()].map((p) => p.destroy()));
    this.worker.terminate();
  }

  // --- internals ------------------------------------------------------------

  _rpc(method, args, transfer) {
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
    if (typeof source === 'string' || source instanceof URL) return this._rpc('mount', { source: String(source) });
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
