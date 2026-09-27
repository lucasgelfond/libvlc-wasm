# AGENTS.md

A guide for coding agents (and people) using **libvlc-wasm**: VLC 4's libvlc compiled to
WebAssembly, with a JS API for playing, probing and converting media in the browser. The
full types are in [`packages/core/src/index.d.ts`](packages/core/src/index.d.ts); this file
is the short version plus the things that are easy to get wrong.

## Install

```sh
npm install libvlc-wasm            # playback, probe, thumbnails
npm install libvlc-wasm-sout       # optional: transcode / remux / record (a bigger build of VLC)
```

## The one requirement: cross-origin isolation

VLC runs on threads, which in a browser means `SharedArrayBuffer`, which only exists when the
page is **cross-origin isolated**. Every response for the page must carry:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

If `crossOriginIsolated` is false in the page, nothing else in this file will work.

- **Vite / SvelteKit**: use the plugin. It sets the headers in dev and preview and keeps the
  engine out of dependency pre-bundling (pre-bundling renames the engine script and breaks
  its worker threads).
  ```js
  // vite.config.js
  import vlc from 'libvlc-wasm/vite';
  export default { plugins: [vlc()] };
  ```
- **Production**: set the two headers on your host (Cloudflare `_headers`, Netlify
  `_headers`, nginx `add_header`, ...).
- **Hosts that cannot set headers** (GitHub Pages): load `libvlc-wasm/coi-serviceworker.js`
  first in `<head>`. It adds the headers from a service worker, at the cost of one reload
  on the first visit.
- Cross-origin resources the page loads (images, a CDN script, media URLs) then need CORS or
  `Cross-Origin-Resource-Policy`, because of `require-corp`.

## Play a file

```js
import { createVLC } from 'libvlc-wasm';

const vlc = await createVLC();                    // one engine per page; reuse it
const player = await vlc.createPlayer({ canvas }); // a <canvas> to draw into
await player.open(file);                          // File, Blob, ArrayBuffer, URL or string URL
player.on('timeupdate', (t) => console.log(t, player.duration));
```

- `createVLC()` downloads and compiles ~26 MB of wasm (~10 MB over the wire compressed).
  Create it once and share it; `vlc.createPlayer()` is cheap and you can have several.
- Files are **read in place, never uploaded or copied whole**: a `File` is mounted and read
  by range, so multi-GB files are fine.
- URLs are streamed with HTTP range requests. The server must allow CORS for the page.
- The picture is drawn with WebGL into the canvas; audio goes through Web Audio.
  `createPlayer({ audio: false })` plays silently with no `AudioContext`.
- Browsers only start audio after a user gesture. Call `open()`/`play()` from a click, or
  expect the first play to be silent until one.

### Controls

`play()`, `pause()`, `togglePause()`, `stop()`, `seek(seconds)`, `currentTime = s`,
`rate = 2`, `volume = 0..2` (above 1 is VLC's boost), `muted`, `nextFrame()` /
`previousFrame()`, `setABLoop(a, b)`, `queue(nextSource)` for gapless playback,
`snapshot()` → JPEG `Blob`, `destroy()`.

Events (`player.on(name, fn)` returns an unsubscribe function; `player.once(name)` is a
promise): `statechange`, `playing`, `paused`, `ended`, `error`, `timeupdate`,
`durationchange`, `tracks`, `chapters`, `chapterchange`, `buffering`, `volumechange`,
`audiolevel`.

### Tracks and subtitles

```js
player.tracks;                                  // [{ id, type: 'video'|'audio'|'text', codec, language, selected, ... }]
await player.selectTrack(player.tracks.find((t) => t.type === 'audio' && t.language === 'es'));
await player.disableTrack('text');
await player.open(video, { subtitles: srtFile }); // or later: player.addSubtitles(file)
await player.open([idxFile, subFile]);            // files that refer to each other by name go together
```

SRT, ASS/SSA (styled, via libass), WebVTT, VobSub, DVB, PGS, closed captions and teletext
all render in the picture. The bundled Noto Sans is the default subtitle font; pass `fonts`
to `createVLC()` for more scripts.

### DVDs

Open an `.iso`, or a `VIDEO_TS` folder as a group of files (e.g. from
`<input type="file" webkitdirectory>` or a drop):

```js
await player.open(isoFile);
player.inMenu;                 // true while a disc menu is on screen
await player.navigate('down'); // 'up' | 'down' | 'left' | 'right' | 'activate' | 'popup'
await player.menu();           // back to the disc's menu
player.chapters.titles;        // DVD titles; player.setTitle(i), player.setChapter(i)
```

Mouse input on the canvas already drives menu buttons when the canvas was given to
`createPlayer`/`attach`. If you draw your own UI over it, forward with
`player.pointer('move' | 'down' | 'up', x, y)` using 0..1 coordinates.
Blu-ray images with HDMV (IG) menus work the same way: the Top Menu is a menu title, and
`navigate()`, `menu()` and the mouse drive its buttons. BD-J (Java) menus are not supported.
Only unencrypted discs play: there is no libdvdcss (or libaacs).

### Picture and sound

`setAspectRatio('16:9' | null)`, `setCrop({ ratio: '2.39:1' } | null)`,
`setDeinterlace(true | 'auto')`, `setAdjust({ brightness, contrast, saturation, hue, gamma } | null)`,
`setEqualizer(presetName | null)` (list with `vlc.equalizerPresets()`),
`setStereoMode(...)`, `setSubtitleDelay(s)`, `setAudioDelay(s)`, `setSubtitleScale(x)`,
`setMarquee({ text })`, `setLogo({ image })`, `setTeletext(page)`.

## Inspect without playing

```js
const info = await vlc.probe(file);                          // { duration, meta, tracks: [...] }
const { blob } = await vlc.thumbnail(file, { position: 0.3, width: 320 });
```

`probe()` rejects after `timeout` ms (default 10000) rather than hanging on a damaged file.

## Convert (needs libvlc-wasm-sout)

```js
import { createVLC } from 'libvlc-wasm';
import sout from 'libvlc-wasm-sout';

const vlc = await createVLC({ engine: sout });
const webm = await vlc.transcode(file, { to: 'webm', onProgress: (f) => bar.value = f });
const mkv = await vlc.transcode(file, { to: 'mkv', remux: true }); // copy streams, no re-encode
```

Outputs a `File`. Targets: `webm`, `mkv`, `mp4` (H.264 + AAC by default; `video: 'hevc'` for
HEVC), `ogg`, `ts`, `wav`, `mp3`. It throws if a
requested encoder does not exist rather than silently dropping the stream. Recording while
playing (`player.startRecording()` / `stopRecording()`) also needs this engine.

## Other entry points

- **`<vlc-player>`** (`import 'libvlc-wasm/element'`): a drop-in for `<video>` with
  `src`, `controls`, `autoplay`, `muted`. Works in any framework as a plain custom element;
  `el.player` is the full `Player` once `el.ready` resolves.
- **Node** (`import { createVLC } from 'libvlc-wasm/node'`): `probe(path)` and
  `thumbnail(path)` headless, no browser.
- **Self-hosting or a CDN**: `createVLC({ moduleUrl, wasmUrl })`, or pass an `engine`
  object `{ moduleUrl, wasmUrl }`. Cross-origin engines are started through a same-origin
  blob worker automatically.
- **MIDI** needs a General MIDI SoundFont: `createVLC({ soundfont: '/path/to.sf2' })`.
- **Size**: the engine is one ~24.5 MiB wasm (~7.8 MB brotli) fetched on the first
  `createVLC()`; the SDK's own JS is ~40 KB. `import('libvlc-wasm')` lazily to keep it off a
  page until needed. Fonts and SoundFonts given as URLs are only downloaded if VLC reads them.
- `createVLC({ logLevel: 'debug' })` and `vlc.on('log', ...)` show VLC's own log, which is
  the first place to look when a file does not play.

### Blu-ray and encrypted media

An unencrypted Blu-ray image (`.iso`) opens like a DVD: playlists are `chapters.titles`,
with chapters (libbluray; HDMV menus are libbluray's, untested here). A Common Encryption (`cenc`) MP4 plays with its
key: `player.open(file, { decryptionKey: '<32 hex digits>' })` (ClearKey).

## What does not work

- DRM whose keys stay in the browser's CDM (Widevine, PlayReady, FairPlay): EME decrypts
  only into a `<video>` element, never into memory a page can read.
- CSS-encrypted DVDs and AACS/BD+ Blu-rays (no libdvdcss/libaacs), and BD-J (Java) menus.
- Physical drives, and network protocols other than HTTP(S) (no RTSP/UDP sockets).
- A handful of files in the test corpus: see `corpus/compat/unplayable.md`.

## Working on this repo

```
native/              the VLC modules and bridge (C): webframe (video out), webaudio (audio out),
                     webcodecs (decoder), webwindow (menu input), bridge.c (the API)
packages/core/       the npm package: src/ is the JS SDK, wasm/ is build output
packages/sout/       the transcoding engine package
build.sh, build/     Docker build of VLC + contribs, link step, patches/ against VLC
apps/player/         the site (SvelteKit): `pnpm dev`, port 5180
tests/               feature, sout, colour and corpus suites (Playwright, all muted)
corpus/, bench/      the format corpus, compatibility matrix and benchmarks
```

```sh
pnpm install
./build.sh                  # full build in Docker (long: VLC and every contrib)
./build.sh link             # relink after changing native/*.c only (minutes)
VARIANT=sout ./build.sh     # the transcoding build
pnpm dev                    # the player at http://localhost:5180
node tests/features.mjs     # playback features, in Chromium, WebKit and Firefox
node tests/sout.mjs         # transcoding
node tests/verify-corpus.mjs --engines=chromium,webkit,firefox   # every corpus format
```

Conventions:

- `native/*.c` are VLC modules and follow VLC's style (4-space indent, `Open`/`Close`,
  `msg_*`, `vlc_mutex`/`vlc_cond`). Changes to VLC itself go in `build/patches` as
  `git format-patch` files with VLC-style subjects (`module: what it does`), small enough
  to upstream.
- Tests never play sound: browsers are launched muted.
- Code here is MIT; the compiled wasm is GPL-2.0-or-later (see `LICENSE`).
