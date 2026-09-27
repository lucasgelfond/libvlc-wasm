// <vlc-player>: a drop-in for <video> that plays what <video> can't.
//
//   <script type="module">import 'libvlc-wasm/element';</script>
//   <vlc-player src="movie.rm" controls autoplay></vlc-player>
//
// It mirrors the HTMLMediaElement surface people already know (src, play(),
// pause(), currentTime, duration, paused, volume, muted, playbackRate, and the
// play/pause/playing/timeupdate/durationchange/ended/error/loadedmetadata/
// volumechange/ratechange events), so it works in any framework. The full
// libvlc-wasm Player is on `.player` for everything else (tracks, subtitles,
// filters, chapters...).
import { createVLC } from './index.js';

let shared = null;
/** One engine per page, shared by every <vlc-player>. */
export function sharedVLC(opts) {
  shared ??= createVLC(opts);
  return shared;
}

const STYLE = `
:host { display: block; position: relative; background: #000; aspect-ratio: 16 / 9; overflow: hidden; contain: content; }
canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.bar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 8px; align-items: center;
  padding: 18px 10px 8px; color: #fff; font: 12px/1 system-ui, sans-serif;
  background: linear-gradient(transparent, rgba(0,0,0,.65)); opacity: 0; transition: opacity .2s; }
:host(:hover) .bar, :host(:focus-within) .bar, .bar.show { opacity: 1; }
button { background: none; border: 0; color: inherit; font-size: 15px; cursor: pointer; width: 26px; padding: 0; }
input[type=range] { accent-color: var(--vlc-accent, #ff8800); }
.seek { flex: 1; min-width: 40px; } .vol { width: 70px; }
.time { font-variant-numeric: tabular-nums; min-width: 84px; text-align: center; }
.msg { position: absolute; inset: 0; display: grid; place-items: center; color: #ccc; font: 13px system-ui, sans-serif;
  text-align: center; padding: 16px; pointer-events: none; }
`;

const fmt = (s) => {
  if (!Number.isFinite(s)) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(x).padStart(2, '0')}`;
};

export class VlcPlayerElement extends HTMLElement {
  static observedAttributes = ['src', 'controls', 'muted', 'volume', 'fit'];

  #player = null;
  #ready = null;
  #token = null;
  #src = null;
  #raf = 0;
  #seeking = false;
  #ui = {};

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><canvas part="canvas"></canvas><div class="msg" part="message"></div>
      <div class="bar" part="controls" hidden>
        <button class="play" aria-label="Play">▶</button>
        <input class="seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Seek">
        <span class="time">0:00 / 0:00</span>
        <button class="mute" aria-label="Mute">🔊</button>
        <input class="vol" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume">
        <button class="fs" aria-label="Fullscreen">⛶</button>
      </div>`;
    const $ = (s) => root.querySelector(s);
    this.#ui = { canvas: $('canvas'), msg: $('.msg'), bar: $('.bar'), play: $('.play'), seek: $('.seek'), time: $('.time'), mute: $('.mute'), vol: $('.vol'), fs: $('.fs') };
    const u = this.#ui;
    u.play.onclick = () => (this.paused ? this.play() : this.pause());
    u.canvas.onclick = () => this.hasAttribute('controls') && (this.paused ? this.play() : this.pause());
    u.canvas.ondblclick = () => this.#fullscreen();
    u.fs.onclick = () => this.#fullscreen();
    u.mute.onclick = () => { this.muted = !this.muted; };
    u.vol.oninput = () => { this.volume = +u.vol.value; };
    u.seek.oninput = () => { this.#seeking = true; u.time.textContent = `${fmt(+u.seek.value)} / ${fmt(this.duration)}`; };
    u.seek.onchange = async () => { await this.#player?.seek(+u.seek.value); this.#seeking = false; };
  }

  connectedCallback() {
    this.#ui.bar.hidden = !this.hasAttribute('controls');
    if (this.#src ?? this.getAttribute('src')) this.#load();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.#raf);
    this.#player?.destroy();
    this.#player = null;
    this.#ready = null;
    this.#token = null;
  }

  attributeChangedCallback(name, _old, value) {
    if (name === 'src' && value != null && this.isConnected) this.src = value;
    if (name === 'controls') this.#ui.bar.hidden = value == null;
    if (name === 'muted') this.muted = value != null;
    if (name === 'volume' && value != null) this.volume = +value;
    if (name === 'fit' && this.#player?.renderer) {
      this.#player.renderer.fit = value ?? 'contain';
      this.#player.renderer.draw();
    }
  }

  /** The libvlc-wasm Player (tracks, subtitles, filters...), once created. */
  get player() { return this.#player; }
  /** Resolves with the Player once the engine is up. */
  get ready() { return this.#ensure(); }

  /** A URL string, File, Blob, bytes, or File[] (e.g. [idx, sub]). */
  get src() { return this.#src ?? this.getAttribute('src') ?? ''; }
  set src(v) {
    this.#src = v;
    if (this.isConnected) this.#load();
  }

  get currentTime() { return this.#player?.currentTime ?? 0; }
  // Setters cannot hand back a promise; errors surface through the 'error' event.
  set currentTime(t) { this.#player?.seek(t).catch(() => {}); }
  get duration() { return this.#player?.duration || NaN; }
  get paused() { return !this.#player || this.#player.paused; }
  get ended() { return this.#player?.state === 'stopped'; }
  get volume() { return this.#player?.volume ?? 1; }
  set volume(v) { this.#ensure().then((p) => { p.volume = v; }, () => {}); }
  get muted() { return this.#player?.muted ?? this.hasAttribute('muted'); }
  set muted(m) { this.#ensure().then((p) => { p.muted = m; }, () => {}); }
  get playbackRate() { return this.#player?.rate ?? 1; }
  set playbackRate(r) { this.#ensure().then((p) => { p.rate = r; }, () => {}); }
  get autoplay() { return this.hasAttribute('autoplay'); }

  async play() { const p = await this.#ensure(); return p.play(); }
  async pause() { return this.#player?.pause(); }
  async stop() { return this.#player?.stop(); }

  #ensure() {
    if (this.#ready) return this.#ready;
    const token = (this.#token = {});
    this.#ready = (async () => {
      const vlc = await sharedVLC();
      const p = await vlc.createPlayer({ canvas: this.#ui.canvas, fit: this.getAttribute('fit') ?? 'contain' });
      // Removed from the page while the engine started: disconnectedCallback
      // had no player to release then, so release it here rather than draw.
      if (this.#token !== token) {
        p.destroy();
        throw new DOMException('<vlc-player> was removed from the page', 'AbortError');
      }
      if (this.hasAttribute('muted')) p.muted = true;
      this.#wire(p);
      this.#player = p;
      return p;
    })().catch((e) => {
      if (e.name !== 'AbortError') { this.#message(e.message); this.#fire('error', { error: e }); }
      throw e;
    });
    return this.#ready;
  }

  async #load() {
    const src = this.src;
    if (!src) return;
    this.#message('');
    try {
      const p = await this.#ensure();
      await p.open(src, { autoplay: this.autoplay });
      this.#fire('loadstart');
    } catch (e) {
      if (e.name === 'AbortError') return;
      this.#message(e.message);
      this.#fire('error', { error: e });
    }
  }

  #wire(p) {
    const u = this.#ui;
    p.on('statechange', (s) => {
      u.play.textContent = s === 'playing' ? '❚❚' : '▶';
      u.play.setAttribute('aria-label', s === 'playing' ? 'Pause' : 'Play');
      if (s === 'playing') this.#fire('playing');
      if (s === 'paused') this.#fire('pause');
      if (s === 'opening') this.#fire('play');
    });
    p.on('durationchange', (d) => { u.seek.max = d || 1; this.#fire('durationchange'); });
    p.on('tracks', () => this.#fire('loadedmetadata'));
    p.on('ended', () => this.#fire('ended'));
    p.on('error', (e) => { this.#message(e.message); this.#fire('error', { error: e }); });
    p.on('volumechange', ({ volume, muted }) => {
      u.vol.value = volume;
      u.mute.textContent = muted || volume === 0 ? '🔇' : '🔊';
      this.#fire('volumechange');
    });
    p.on('ratechange', () => this.#fire('ratechange'));
    p.on('timeupdate', () => this.#fire('timeupdate'));
    const tick = () => {
      this.#raf = requestAnimationFrame(tick);
      if (this.#seeking || u.bar.hidden) return;
      u.seek.value = p.currentTime;
      u.time.textContent = `${fmt(p.currentTime)} / ${fmt(p.duration)}`;
    };
    this.#raf = requestAnimationFrame(tick);
  }

  #fire(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  #message(text) { this.#ui.msg.textContent = text; }
  #fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else this.requestFullscreen?.(); }
}

if (typeof customElements !== 'undefined' && !customElements.get('vlc-player')) {
  customElements.define('vlc-player', VlcPlayerElement);
}
