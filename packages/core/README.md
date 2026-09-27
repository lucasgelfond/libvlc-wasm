# libvlc-wasm

VLC 4's playback engine (libvlc) compiled to WebAssembly. It plays the formats browsers
can't — RealMedia, WMV/WMA, DivX/Xvid AVIs, DVD VOBs, MPEG-TS with AC-3/DTS, FLV,
QuickTime oddities, Bink/Smacker/RoQ game video, TrueHD/MLP, Musepack/APE/TTA,
tracker modules, chiptunes, MIDI, MKV with ASS subtitles — through VLC's own demuxers,
clock, audio pipeline and subtitle renderer, drawing to a `<canvas>`.

```js
import { createVLC } from 'libvlc-wasm';

const vlc = await createVLC();
const player = await vlc.createPlayer({ canvas: document.querySelector('canvas') });

input.onchange = () => player.open(input.files[0]);   // File, Blob, bytes or URL
player.on('timeupdate', (t) => (time.textContent = t.toFixed(1)));
```

## Serving: cross-origin isolation is required

VLC is multithreaded, which in a browser means `SharedArrayBuffer`, which is only
available on a cross-origin isolated page. Serve your page with:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`createVLC()` throws a clear error if the page is not isolated. Vite:
`server.headers` / `preview.headers` (see `examples/svelte-player/vite.config.js`).
Netlify/Cloudflare Pages: a `_headers` file. Anything cross-origin you load (media
URLs, fonts) then needs CORS or `Cross-Origin-Resource-Policy`.

Also serve `libvlc.wasm` with `Content-Type: application/wasm` so it compiles while
it downloads, and compressed (it is ~26 MB raw, ~8 MB brotli).

## API

### `createVLC(options?) → Promise<VLC>`

Starts a dedicated Worker, compiles the wasm, pre-starts a thread pool and calls
`libvlc_new()`. One `VLC` can drive many players.

| option | default | |
|---|---|---|
| `threads` | `20` | pthreads started up front; more are started on demand, but each costs a Worker boot |
| `decoderThreads` | `min(cores, 4)` | FFmpeg threads per video decoder |
| `logLevel` | `'warn'` | what reaches the `'log'` event |
| `args` | `[]` | extra `libvlc_new()` arguments |
| `fonts` | bundled Noto Sans | font files for subtitles; `false` to skip |
| `soundfont` | none | a General MIDI `.sf2` URL — without one `.mid` files do not play |
| `wasmUrl` / `workerUrl` | next to the module | self-hosting overrides |

### `vlc.createPlayer({ canvas, fit, audio, audioContext, audioDestination, keepAwake })`

`canvas` gets WebGL2 video (you can also `player.attach(canvas)` later). `audio: false`
plays silently without an `AudioContext`; `audioDestination` routes the output through
your own Web Audio graph.

### `player.open(source, { autoplay, startTime, subtitles, options })`

`source` is a `File`, `Blob`, `ArrayBuffer`/typed array, an `http(s)` URL or a VLC MRL.
Files are **not copied**: they are mounted with Emscripten's WORKERFS and VLC reads
them on demand, so a 4 GB file costs nothing up front. URLs are read with ranged
requests (the server must allow CORS and `Range`). Pass an array to mount files
that reference each other — `[idx, sub]`, `[cue, bin]` — the first is opened.

DVDs: open an `.iso`, or the files of a `VIDEO_TS` folder (from `<input webkitdirectory>`) as an
array with `VIDEO_TS.IFO` first. `player.chapters.titles` lists the menu and titles; menus are
driven with `player.navigate('up' | 'down' | 'left' | 'right' | 'activate' | 'popup')`.
Encrypted (CSS) discs are not supported: libdvdcss is not in the build.

`options` are VLC media options, e.g. `[':sub-track=0']` to show the first subtitle
track (VLC only auto-selects subtitles flagged default/forced).

### Playback

`play()` (call it from a user gesture the first time so audio can start), `pause()`,
`togglePause()`, `stop()`, `seek(seconds, { fast })`, `seekToPosition(0..1)`,
`nextFrame()`; properties `currentTime` (interpolated, settable), `duration`, `state`,
`paused`, `rate`, `volume` (0–2), `muted`, `audioLevel`.

### Tracks, subtitles, chapters

`player.tracks` (`{ id, type, codec, codecName, language, width, height, fps, channels, rate, selected, … }`),
`selectTrack(id)`, `disableTrack('text')`, `addSubtitles(file)`, `addAudioTrack(file)`,
`setSubtitleDelay(s)`, `setAudioDelay(s)`, `player.chapters`, `setChapter(i)`, `setTitle(i)`.

### Video and audio processing

`setDeinterlace(true | false | 'auto', mode)` (yadif, yadif2x, blend, bob, linear, x,
phosphor, ivtc…), `setAdjust({ brightness, contrast, saturation, hue, gamma })`,
`setAspectRatio('16:9')`, `setEqualizer('Rock')` (`vlc.equalizerPresets()` lists them),
`snapshot()` → PNG `Blob` of the frame on screen.

### Without playing

- `vlc.probe(source)` → `{ duration, meta, tracks }` via VLC's demuxers (ffprobe/exiftool-style)
- `vlc.thumbnail(source, { time | position, width, height, fast })` → `{ blob, width, height }` (JPEG)

### Converting (the `sout` build)

VLC's stream output — transcoding, remuxing, recording — makes the wasm 33 MB instead of 26
(9.7 MB brotli instead of 7.9), so it is a separate package, `libvlc-wasm-sout`, loaded instead of the default engine. `vlc.features.sout` says which you have.

```js
import sout from 'libvlc-wasm-sout';   // npm i libvlc-wasm-sout
const vlc = await createVLC({ engine: sout });
const webm = await vlc.transcode(file, { to: 'webm', width: 640, onProgress: (p) => bar.value = p });
const mp4 = await vlc.transcode(mkv, { to: 'mp4', remux: true });   // no re-encoding
const opus = await vlc.transcode(avi, { to: 'ogg', video: false });
```

Output is a `File`, built in memory. Encoders (checked by `tests/sout.mjs` and by hand):
video VP8 (`'VP80'`), MPEG-4 Part 2 (`'mp4v'`), MPEG-1/2 (`'mp1v'`, `'mp2v'`); audio Opus,
Vorbis (`'vorb'`), AAC (`'mp4a'`), MP3 (`'mp3'`), MP2 (`'mpga'`), FLAC and PCM (`'s16l'`).
VP9 (`'VP90'`) encodes but is slow and currently loses its final lookahead frames. If VLC
has no encoder for a stream you asked for, `transcode()` throws rather than returning a
file without it. There is no H.264/HEVC encoder
(x264/x265 do not build for wasm), so for something every browser plays back, use WebM
(VP8 + Opus): MPEG-4 Part 2 in MP4 plays in Chrome and Firefox but not Safari. Remuxing
copies streams as they are, so it is fast and lossless but keeps their codecs.
A software VP8 encode runs a few times faster than realtime at SD sizes.

`player.startRecording()` / `stopRecording()` → `File` records what is playing, as-is.

### Events

`player.on(type, fn)` returns an unsubscribe function; `player.once(type)` returns a promise.
`statechange`, `playing`, `paused`, `stopped`, `ended`, `error`, `timeupdate` (~4 Hz),
`durationchange`, `tracks`, `chapters`, `chapterchange`, `buffering`, `ratechange`,
`volumechange`, `audiolevel` (~10 Hz), `capabilities`, `meta`. `vlc.on('log', …)`.

### Diagnostics

`player.info()` (metadata, tracks, VLC's input/decoder counters) and `player.stats()`
(adds frames displayed/drawn, audio frames played, dropped audio, underruns).

## How it works

```
page                             Worker (Emscripten main thread)        VLC pthreads
────                             ─────────────────────────────         ────────────
createVLC ── postMessage ─────▶  engine.js ── wv_submit ──────────────▶ control thread → libvlc_*()
Player  ◀─── events ───────────  MAIN_THREAD_ASYNC_EM_ASM ◀──────────── player callbacks
Renderer (WebGL2) ◀── reads frames straight from wasm memory ─────────── webframe vout (native/webframe.c)
AudioWorklet      ◀── reads float PCM ring straight from wasm memory ── webaudio aout (native/webaudio.c)
                                 WORKERFS/FileReaderSync ◀── proxied reads ─ input thread
```

- libvlc calls run on a dedicated control pthread, never on the Worker's JS thread,
  because that thread serves every filesystem read VLC's threads make.
- Video goes through a small VLC video output of ours (`native/webframe.c`) into three shared
  buffers; the page uploads the newest one each animation frame. It keeps the decoder's own pixel
  layout (4:2:0, 4:2:2, 4:4:4, NV12, 10-bit, RGB) and passes the stream's colour range and matrix,
  so YUV→RGB happens in the shader, exactly (measured within 1–2/255 in Chrome, Safari and
  Firefox), with no per-frame conversion in wasm.
- H.264, HEVC, VP9 and AV1 go to the browser's decoder through WebCodecs when it can decode them
  (`native/webcodecs.c`); the first frame is verified on a throwaway decoder, and anything it
  refuses — or can only return as GPU-only frames — falls back to FFmpeg/dav1d without losing a
  frame. `createVLC({ args: ['--no-webcodecs'] })` turns it off.
- Audio uses a small VLC audio output module of ours (`native/webaudio.c`) that
  reports real playback position back to VLC, so audio is the master clock and A/V
  sync is VLC's own — not an approximation in JS.

## Size and licensing

The wasm bundles libvlc/libvlccore and 260+ VLC modules with FFmpeg, dav1d, libvpx,
libass, FreeType, HarfBuzz, libmatroska, libmodplug, game-music-emu, FluidLite,
libxml2, libarchive and more. libvlc is LGPL-2.1+, but some bundled modules and
contribs are GPL, so treat the binary as **GPL-2.0-or-later** unless you rebuild
without them. The bundled Noto Sans font is OFL-1.1 (`fonts/OFL.txt`).
