# libvlc-wasm

**VLC 4's engine, compiled to WebAssembly, as a JavaScript SDK.** It plays the media browsers
can't — RealMedia, WMV/WMA, DivX/Xvid AVIs, DVD and Blu-ray images, MPEG-TS with AC-3/DTS,
FLV/VP6, QuickTime/Sorenson, Bink/Smacker/RoQ and PlayStation video, TrueHD/MLP/Musepack/APE,
tracker modules, chiptunes (SNES, Genesis, NES, C64), MIDI, MKV with ASS subtitles — through
VLC's own demuxers, clock, audio pipeline, subtitle renderer and filters, and hands
H.264/HEVC/VP9/AV1 to the browser's hardware decoders through WebCodecs when it can.

```sh
npm install libvlc-wasm            # playback, probing, thumbnails
npm install libvlc-wasm-sout       # optional: transcoding, remuxing, recording
```

```js
import { createVLC } from 'libvlc-wasm';

const vlc = await createVLC();
const player = await vlc.createPlayer({ canvas });
await player.open(fileInput.files[0]);        // File, Blob, bytes, URL, or [idx, sub]
player.on('timeupdate', (t) => console.log(t));
console.log(await vlc.probe(file));           // ffprobe-style, no playback
```

```html
<script type="module">import 'libvlc-wasm/element';</script>
<vlc-player src="old-trailer.rm" controls autoplay></vlc-player>
```

The full API, with the things that are easy to get wrong, is in [AGENTS.md](AGENTS.md); the
types are in [packages/core/src/index.d.ts](packages/core/src/index.d.ts). The player site
(`apps/player`, `pnpm dev`) is meant to go up at libvlc.lucasgelfond.online.

**Status**: working SDK, published on npm. Of 93 curated files in formats browsers can't play
(DVD and Blu-ray images and ClearKey MP4 included), libvlc-wasm plays 88; desktop VLC 3 plays 82,
Chrome 17, Safari 25, Firefox 16. Over FFmpeg's whole FATE sample suite it plays 2,041 of the
2,183 files native FFmpeg or VLC can (FFmpeg 2,172, VLC 3 1,535), and it is measured against
more public suites (conformance streams, codec test vectors, browser test media) on the
player site's formats page (`/formats`). It runs in Chrome, Safari and
Firefox, in dev and production builds.

**It is VLC throughout.** Every file goes through libvlc's player: VLC's input thread,
demuxers, decoders, clock, and audio and video outputs. FFmpeg is there the way it is in
desktop VLC, behind VLC's own `avcodec` and `avformat` modules. The JavaScript never demuxes
or decodes: when VLC's native demuxer finds nothing playable in a file, `open()` asks VLC
once more with its `:demux=avformat` option, as `vlc --demux=avformat` would on the desktop.

## What it does

**Playback**: play/pause/stop, precise and fast seek, rate 0.25–4× (pitch-preserving), frame
stepping both ways, AB-loop, gapless next-media queue, volume up to 200%, several players at
once, screen wake lock.
**Video**: WebGL2 rendering of the decoder's native layout (4:2:0/4:2:2/4:4:4, NV12, 10-bit,
RGB) with the stream's colour range and matrix — exact to 1–2/255 in every engine — correct
sample aspect ratio, fit modes, aspect/crop override, deinterlacing (yadif, bob, ivtc, …),
picture adjustments, marquee and logo overlays, snapshots, teletext, program selection.
**Audio**: VLC's A/V clock driven by the real playback position of an AudioWorklet, 10-band EQ
with VLC's presets, stereo modes, output routed into your own Web Audio graph, a level meter,
MIDI via FluidSynth with a SoundFont you supply.
**Subtitles**: libass (ASS/SSA with styling), SRT/VTT/SUB/USF/TTML, VobSub, DVB, CEA-608,
external files, delay and scale. The font is only downloaded when a subtitle needs it.
**Without playing**: `probe()` (container, tracks, codecs, metadata) and `thumbnail()` (JPEG).
**Converting** (`libvlc-wasm-sout`, `createVLC({ engine: sout })`): `transcode()` to
WebM/MP4/MKV/Ogg/TS/WAV/MP3 — H.264 (x264) and HEVC (x265), VP8/VP9, AAC, Opus… — lossless
`remux`, and `startRecording()` while playing.
**Inputs**: `File`/`Blob` (read on demand, never copied), bytes, http(s) URLs (range
requests), multi-file groups (VIDEO_TS folders, `.idx` + `.sub`). Also runs headless under
Node for probing and thumbnails.
**Decoding**: FFmpeg, dav1d, libvpx, mpg123, gme, libmodplug, libsidplay2 and VLC's own
decoders in wasm; **WebCodecs** (hardware) for H.264, HEVC, VP9 and AV1 when the browser can,
with automatic fallback to software when it can't.

**DVD**: ISO images and VIDEO_TS folders through dvdnav — menus (by mouse or keys), titles,
chapters, audio and subtitle languages, the disc's own navigation commands.

**CSS-encrypted DVDs**: libvlc-wasm does not distribute libdvdcss, the way Debian, Ubuntu and
Fedora leave it out of their archives but let users build it themselves:

```sh
WITH_DVDCSS=1 ./build.sh     # fetches libdvdcss from VideoLAN and compiles it on your machine
```

The engine lands in `build/engines/dvdcss/` (ignored by git, never packaged or published).
Serve its two files yourself and load them with
`createVLC({ engine: { moduleUrl: '/libvlc-dvdcss.js', wasmUrl: '/libvlc-dvdcss.wasm' } })`.
Whether you may use it depends on where you live.

**Blu-ray**: unencrypted BDMV images through libbluray: playlists and chapters (tested), and
HDMV menus (libbluray renders them; a test disc with a menu is being authored). No
BD-J (Java) menus and no AACS/BD+, so commercial discs do not play.

**Encrypted media**: MP4 with Common Encryption (`cenc`) plays when you have its key
(ClearKey): `player.open(file, { decryptionKey })`. Widevine, PlayReady and FairPlay keys never
leave the browser's CDM, which only decrypts into a `<video>` element.

Not available in a browser: raw sockets (RTSP/UDP multicast), optical drives, hardware
passthrough of Dolby/DTS.

## Using it in an app

Pages must be **cross-origin isolated** (VLC's threads need `SharedArrayBuffer`):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- **Vite / SvelteKit**: `import vlc from 'libvlc-wasm/vite'` and add `vlc()` to `plugins`. It
  sets the headers in dev and preview and keeps the engine out of dependency pre-bundling.
- **Production**: set the headers on your host (Cloudflare/Netlify `_headers`, nginx
  `add_header`); `apps/player/static/_headers` is a working example.
- **Hosts without headers** (GitHub Pages): load `libvlc-wasm/coi-serviceworker.js` first.
- Serve `libvlc.wasm` compressed: about 25.7 MB raw (24.5 MiB), 10 MB gzip, 7.8 MB brotli.

**Size and bundling.** The SDK's own JavaScript is about 40 KB; the engine is one wasm file
fetched by the first `createVLC()`. Bundlers emit it as an asset; nothing downloads it until
then. `tests/bundle.mjs` builds real Vite apps and checks it:

| how the app uses it | entry JS | downloaded on page load | downloaded when used |
|---|---|---|---|
| `import { createVLC }` + `probe()` | 36 KB | 36 KB | +26 MB |
| `createPlayer()` + play | 36 KB | 36 KB | +27 MB |
| `<vlc-player>` element | 42 KB | 42 KB | +27 MB |
| `await import('libvlc-wasm')` on demand | 37 KB | **2 KB** | +26 MB |
| transcoding engine imported on demand | 37 KB | 37 KB | +35 MB (only the sout wasm) |

A browser compiles a wasm module as a whole, so tree shaking cannot drop parts of it; lazy
`import()` is how to keep it off pages that don't need it.

## Performance

Apple M5, Chrome 153, 1080p30 clips; full tables and method in
[bench/results/RESULTS.md](bench/results/RESULTS.md), summary image in
[bench/results/chart.png](bench/results/chart.png).

- **Startup**: `createVLC()` is ready in about **210–230 ms** (worker, wasm compile, threads,
  `libvlc_new`). First frame of a file typically **20–100 ms** after `open()`.
- **Hardware path**: with WebCodecs, H.264, HEVC, VP9 and AV1 play through at **410–550 fps**:
  the player's pacing ceiling, not the decoder.
- **Software path** (everything else, or when the browser lacks a codec), the full player vs the
  same player natively (VLC 3, software), 1080p, one thread:

  | codec | native VLC | libvlc-wasm | ffmpeg.wasm (decode only) |
  |---|---|---|---|
  | H.264 | 99 fps | 65 fps | 57 fps |
  | HEVC | 177 fps | 110 fps | 89 fps |
  | VP9 | 242 fps | 136 fps | 128 fps |
  | AV1 (dav1d) | 146 fps | 70 fps | no decoder |
  | MPEG-4 ASP | 554 fps | 282 fps | 396 fps |
  | MPEG-2 | 567 fps | 358 fps | 538 fps |

  Even the slowest are twice real time at 1080p30. Where native has hand-written SIMD (dav1d,
  parts of FFmpeg) the gap is widest, since wasm can only autovectorize C.
- **vs converting first**: the first frame of a RealVideo file takes libvlc-wasm **42 ms**;
  ffmpeg.wasm has to convert it before a `<video>` can show it (about 1.2 s for 10 s of video).
- **WASI runtimes**: the same FFmpeg decoder C code on WAVM, WAMR, WasmEdge, wasm2c, Wasmer,
  Wasmtime, Wazero, Node and Bun vs native: [bench/wasi](bench/wasi/).

## Compared with other "VLC in the browser" projects

Every web VLC port there is, measured on the same files: addyosmani/vlc.js, Krowemoh/vlc.js,
jbk/vlc.js (its published demo and a build from source) and addyosmani/webvlc, plus ffmpeg.wasm
and the browsers themselves — see [bench/compare/COMPARISON.md](bench/compare/COMPARISON.md)
and the site's formats page. The existing ports run a
2022–2024 VLC 4 snapshot with no build scripts (or none that still work), no audio output of
their own and no API; libvlc-wasm builds current VLC master from source with four small
modules of its own — `webaudio`, `webframe`, `webcodecs`, `webwindow` — and a short series
of upstreamable patches.

## Repository

```
build.sh, build/        Docker toolchain (Debian + emsdk), VLC build, link, patches/
native/                 the C side: bridge.c (API + threading), webaudio.c (audio out),
                        webframe.c (video out), webcodecs.c (decoder), webwindow.c (pointer input),
                        shared.h (memory layouts shared with JS)
packages/core/          the libvlc-wasm npm package: src/ (JS SDK), wasm/ (built), fonts/
packages/sout/          the libvlc-wasm-sout npm package (transcoding engine)
apps/player/            the player site (SvelteKit): pnpm dev
examples/               vanilla HTML pages and a Node CLI
tests/                  every test suite; tests/all.mjs runs them all
corpus/                 test media: manifest, fetchers, R2 sync, compatibility matrices
bench/                  benchmarks, the chart, other ports, WASI runtimes
.claude/skills/verify/  the procedure for checking a VLC update or native change
```

## Building

Needs Docker. The first build fetches VLC and builds its ~60 contribs (FFmpeg, dav1d, libass…):
about 20–40 minutes on an M-series Mac; later builds are incremental.

```sh
./build.sh                 # toolchain image, VLC for wasm, link -> packages/core/wasm/
./build.sh link            # relink only (a minute): after changing native/
VARIANT=sout ./build.sh    # the transcoding engine -> packages/sout/wasm/, its own build tree
WITH_DVDCSS=1 ./build.sh   # your own engine with libdvdcss -> build/engines/dvdcss/ (never shipped)
PROFILE=debug ./build.sh   # assertions and symbols; PROFILE=names keeps function names only
VLC_COMMIT=<sha> ./build.sh   # try another VLC master commit
```

VLC's source is pinned in `build.sh`; our changes to it are `build/patches/`, one
`git format-patch` file per fix with a message saying why. Updating VLC: see
[.claude/skills/verify/SKILL.md](.claude/skills/verify/SKILL.md).

## Running the player site

```sh
pnpm install
pnpm dev                                  # http://localhost:5180 (samples copied on first run)
pnpm --filter player build                # static build in apps/player/build
cd apps/player && npx wrangler deploy     # Cloudflare (wrangler.jsonc, static/_headers)
```

URL parameters for quick checks: `?sample=dvd` (or `bluray`, `playstation`, `c64`, …),
`?url=https://…` to play a URL, `?test=<corpus file>`.

## Testing

Everything, silently (every browser the tests launch is muted, including WebKit, which has no
mute switch of its own):

```sh
pnpm test:quick     # ~2 min: node smoke, features + transcoding in Chromium, colours, the site
pnpm test           # ~15 min: all three browsers, the corpus baseline, npm tarballs, bundle sizes
pnpm test -- --only=features,sout --engines=webkit    # a subset
```

| suite | what it checks |
|---|---|
| `tests/node-smoke.mjs` | probe and thumbnail under Node |
| `tests/features.mjs` | 29 playback features: seek, rate, AB loop, tracks, subtitles, DVD menus by mouse and keys, Blu-ray, ClearKey, URLs, two players… |
| `tests/sout.mjs` | 12 transcodes (H.264, HEVC, VP8, Opus, MP3…), remux, recording |
| `tests/colors.mjs` | colour accuracy per pixel layout (within 8/255) |
| `tests/app.mjs` | the player site end to end: sample menu, DVD click-through, `?sample=`, a picked file, the formats page |
| `tests/corpus-check.mjs` | every curated sample in `tests/corpus-baseline.json` still plays |
| `tests/package.mjs` | the packed npm tarballs in a fresh Vite app: play and transcode |
| `tests/bundle.mjs` | what each way of importing the SDK ships and downloads |

Fixtures the suites use are generated, not downloaded: `sh tests/make-fixtures.sh`,
`sh tests/make-colors.sh` (need ffmpeg), and in Docker `tests/make-dvd.sh` and
`tests/make-bluray.sh` (commands at the top of each). The `verify` skill
(`.claude/skills/verify/`) is the cheapest-first procedure for checking a change.

## Test media

| what | where it comes from | how to get it |
|---|---|---|
| curated corpus (93 files, `corpus/manifest.json`) | FFmpeg's sample server, VLC's sample archive, others; each entry has its URL and sha256 | `node corpus/fetch.mjs` |
| FFmpeg FATE suite (2,540 files, 1.3 GB) | `rsync://fate-suite.ffmpeg.org/fate-suite/` | `rsync -a rsync://fate-suite.ffmpeg.org/fate-suite/ corpus/fate/` |
| other suites (conformance, libvpx/libaom/dav1d vectors, browser test media, …) | listed in `corpus/suites/<name>.json` | `node corpus/suites/fetch.mjs <name>` |
| all of the above, in one place | the project's R2 bucket `libvlc-wasm-media` (needs access to the Cloudflare account) | `node corpus/r2-sync.mjs pull` (`push` after adding files) |
| app samples | `apps/player/static/samples/` (disc images committed; the rest copied or downloaded) | `node apps/player/scripts/samples.mjs` (runs before `pnpm dev`) |

All media directories are gitignored; the manifests, hashes and results are committed.

## Measuring format support

```sh
node tests/verify-corpus.mjs --engines=chromium,webkit,firefox   # libvlc-wasm + browsers on the corpus
node corpus/compat/build.mjs                  # native VLC, native FFmpeg, ffmpeg.wasm -> compat.json
node corpus/compat/fate.mjs                   # the FATE suite with every tool -> fate-*.json, FATE.md
node corpus/compat/suite.mjs --suite=libvpx   # any other suite -> corpus/compat/suites/
```

Each step caches per file (`--resume`, `--retry=<status>` to re-measure) and writes a
summary the formats page reads. "Plays" means the same for every tool: a file with video
shows a picture, a file with audio makes sound (measured silently).

## Benchmarks

```sh
sh bench/make-media.sh                  # 5 s of 1080p30 per codec -> bench/media/
node bench/run.mjs                      # native FFmpeg, native VLC, libvlc-wasm, ffmpeg.wasm -> bench/results/
node bench/chart.mjs                    # bench/results/chart.png (also copied to the site)
node bench/compare/vlcjs.mjs            # the other web VLC ports (krowemoh.mjs, jbk.mjs, webvlc.mjs; --engine=)
sh bench/wasi/setup-tools.sh && node bench/wasi/run.mjs   # WASI runtimes
```

Native columns need FFmpeg and VLC.app installed; `--threads=1,4`, `--only=h264` and
`--skip=native,ffmpegwasm` narrow a run.

## Publishing

`packages/core` and `packages/sout` publish to npm as `libvlc-wasm` and `libvlc-wasm-sout`
(same version; `libvlc-wasm-sout` peers on `libvlc-wasm`). CI builds, tests and publishes on a
`v*` tag with provenance (`.github/workflows/build.yml`). By hand: `pnpm publish` in each
package, core first, or `npm stage publish` with a staging-only token.

## License

Two parts (see [LICENSE](LICENSE)):

- **The code in this repository is MIT**: the SDK, types, the VLC modules and bridge in
  `native/`, build scripts, tests, benchmarks and the player app.
- **The compiled engine (`libvlc.wasm`) is GPL-2.0-or-later** ([COPYING](COPYING)). libvlc
  itself is LGPL-2.1+, but the build links GPL modules and contribs (libdvdnav, libdvdread
  and others), which makes the binary as a whole GPL. The patches in `build/patches` modify
  VLC and stay under VLC's licenses.

The npm packages carry both, as `"license": "MIT AND GPL-2.0-or-later"`. Noto Sans (bundled
for subtitles) is OFL-1.1.
