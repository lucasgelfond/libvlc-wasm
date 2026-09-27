# libvlc-wasm

**VLC 4's engine, compiled to WebAssembly, as a JavaScript SDK.** It plays the media browsers
can't — RealMedia, WMV/WMA, DivX/Xvid AVIs, DVD VOBs, MPEG-TS with AC-3/DTS, FLV/VP6,
QuickTime/Sorenson, Bink/Smacker/RoQ, TrueHD/MLP/Musepack/APE/TTA, tracker modules,
chiptunes, MIDI, MKV with ASS subtitles — through VLC's own demuxers, clock, audio pipeline,
subtitle renderer and filters, and hands H.264/HEVC/VP9/AV1 to the browser's hardware decoders
through WebCodecs when it can.

```html
<script type="module">import '@libvlc-wasm/core/element';</script>
<vlc-player src="old-trailer.rm" controls autoplay></vlc-player>
```

```js
import { createVLC } from '@libvlc-wasm/core';

const vlc = await createVLC();
const player = await vlc.createPlayer({ canvas });
await player.open(fileInput.files[0]);        // File, Blob, bytes, URL, or [idx, sub]
player.on('timeupdate', (t) => console.log(t));
console.log(await vlc.probe(file));           // ffprobe-style, no playback
```

**Status**: working SDK. 62 of 75 obscure test files play (Chromium plays 3 of them natively),
every failure is classified, and it runs in Chromium, Chrome, Firefox and Safari (WebKit), in dev
and production builds. See [what works](#what-it-does), [numbers](#performance) and
[how it compares](#compared-with-other-browser-media-projects).

## Why not the existing "VLC in the browser" projects?

| | libvlc-wasm | [addyosmani/vlc.js](https://github.com/addyosmani/vlc.js) | [addyosmani/webvlc](https://github.com/addyosmani/webvlc) |
|---|---|---|---|
| What it is | reproducible build of VLC 4 master + SDK | a vendored 27 MB `experimental.wasm` (VideoLabs demo, 2024-03) + UI | a React UI around `<video>` |
| Is it libvlc? | yes, rebuilt from source (pinned commit) | yes, but no build scripts: can't be rebuilt or updated | no wasm at all |
| Formats beyond `<video>` | yes (see corpus) | see [measured comparison](bench/compare/COMPARISON.md) | none |
| API | documented, typed, `<vlc-player>` element | internal demo code | n/a |

Upstream VLC has the emscripten *plumbing* (a build script, threads, a JS file access module, a
logger) but no audio output, video output or WebCodecs decoder; the only implementation of those
was a 77-patch stack in `code.videolan.org/jbk/vlc.js` last touched in 2022. This project does
not use it: it drives libvlc 4 through its **public** API and adds two small out-of-tree VLC
modules of its own, so it builds against current VLC master with only three small patches.

## What it does

**Playback**: play/pause/stop, precise and fast seek, rate 0.25–4× (pitch-preserving), frame
stepping both ways, AB-loop, gapless next-media queue, volume up to 200%, several players at
once, screen wake lock.
**Video**: WebGL2 rendering with correct aspect ratio, fit modes, aspect/crop override,
deinterlacing (yadif, bob, ivtc, …), picture adjustments, marquee and logo overlays, snapshots,
teletext, program selection for multi-program TS.
**Audio**: VLC's A/V clock driven by the real playback position of an AudioWorklet,
10-band EQ with VLC's presets, stereo modes, output routed into your own Web Audio graph,
a level meter, MIDI via FluidSynth with a SoundFont you supply.
**Subtitles**: libass (ASS/SSA with styling), SRT/VTT/SUB/USF/TTML, VobSub, DVB, CEA-608,
external files, delay and scale.
**Without playing**: `probe()` (container, tracks, codecs, metadata) and `thumbnail()` (JPEG).
**Inputs**: `File`/`Blob` (read on demand — never copied), bytes, http(s) URLs (range requests),
multi-file groups, VLC MRLs. Also runs headless under Node for probing/thumbnails.
**Decoding**: FFmpeg, dav1d, libvpx, mpg123, gme, libmodplug and VLC's own decoders in wasm;
**WebCodecs** (hardware) for H.264, HEVC, VP9, AV1 when the browser can, with automatic,
lossless fallback to software when it can't.

Not available in a browser: raw sockets (RTSP/UDP multicast), optical drives, hardware
passthrough of Dolby/DTS. Built but not enabled by default: VLC's stream output (transcoding,
remuxing, recording) — see [build profiles](#build-profiles).

## Performance

<!-- filled by bench/run.mjs -->
See [bench/results/RESULTS.md](bench/results/RESULTS.md) for the full table and method.

## Compared with other browser media projects

See [bench/compare/COMPARISON.md](bench/compare/COMPARISON.md): addyosmani/vlc.js and webvlc
(measured on the same corpus), ffmpeg.wasm, libav.js, mediabunny, web-demuxer, ogv.js, jsmpeg,
hls.js/shaka/dash.js and chiptune players.

## Repository

```
build.sh, build/           Docker toolchain (Debian + emsdk), VLC build, link, patches/
native/                    the C side: bridge.c (API + threading), webaudio.c (aout),
                           webcodecs.c (decoder), shared.h (memory layouts shared with JS)
packages/core/             the npm package: src/ (JS SDK), wasm/ (built), fonts/
examples/                  vanilla HTML pages, a Svelte app, a Node CLI
tests/                     Node smoke test, browser harness, feature suite, corpus verifier
corpus/                    manifest of 75 obscure samples, fetcher, native reference levels, results
bench/                     browser vs native benchmarks, WASI runtime benchmark, comparisons
.github/workflows/         CI: build, test, package, release
```

## Building

Needs Docker. The first build fetches VLC and builds its ~60 contribs (FFmpeg, dav1d, libass…):
about 20 minutes on an M-series Mac, an hour on a CI runner; later builds are incremental.

```sh
./build.sh              # toolchain image, VLC for wasm, link → packages/core/wasm/
./build.sh link         # relink only (seconds): after changing native/
PROFILE=debug ./build.sh   # assertions and symbols
VLC_COMMIT=<sha> ./build.sh   # try another VLC master commit
pnpm install && node tests/node-smoke.mjs && node tests/features.mjs
sh tests/make-fixtures.sh && node corpus/fetch.mjs && node tests/verify-corpus.mjs
```

The three VLC patches (`build/patches/`) are small and upstreamable: a `jpeg` option declared only
under `ENABLE_SOUT` (asserts in no-sout builds), native wasm exceptions for contribs (libmatroska
throws during ordinary parsing), and a libass fallback font on emscripten.

## Serving

Pages must be cross-origin isolated (threads need `SharedArrayBuffer`):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`examples/vanilla/serve.mjs` is a 60-line reference server. Serve `libvlc.wasm` compressed:
25 MB raw, about 10 MB gzip / 7 MB brotli.

## License

libvlc is LGPL-2.1+, but the build includes GPL modules and contribs, so the wasm is
GPL-2.0-or-later. Our own code (bridge, modules, SDK, examples) follows the same license.
Noto Sans (bundled for subtitles) is OFL-1.1.
