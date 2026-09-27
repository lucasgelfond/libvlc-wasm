# libvlc-wasm compared with other browser media projects

Measured where it could be measured on this machine (Apple M5, macOS 26.6, Chrome 153,
2026-09-27); everything else is from each project's source, docs and npm metadata on that date.

## The two "VLC in the browser" projects

**[addyosmani/vlc.js](https://github.com/addyosmani/vlc.js)** ships a prebuilt 27 MB
`experimental.wasm` (VLC 4.0.0-dev, built 2024-03-07 by VideoLabs for their demo, copied via
Krowemoh/vlc.js) with a VLC-styled UI. There are no build scripts, so it cannot be rebuilt,
updated or trimmed. It starts libvlc with `--codec=webcodec --aout=emworklet_audio`, uses an
OffscreenCanvas GL output inside a pthread, and exposes a thin `MediaPlayer`/`Media` wrapper over
~45 exported C functions. Its README calls it "very experimental and known to be very buggy".

**[addyosmani/webvlc](https://github.com/addyosmani/webvlc)** is a React UI around the
browser's own `<video>` element (plus a butterchurn visualiser). It contains no wasm and no VLC:
it plays exactly what the browser plays natively.

### Measured on the same corpus

`node bench/compare/vlcjs.mjs` drives addyosmani/vlc.js's own UI in headless Chrome (muted),
feeds each video sample through its file input and checks its canvas for a real picture.

| | libvlc-wasm | addyosmani/vlc.js |
|---|---|---|
| Video samples showing a picture (of 45) | **40** | 37 |
| Plays that the other does not | Smacker, Autodesk FLIC ×2 | none |
| Plays in neither | MS Screen 2, Vivo, PSX STR, 1-frame 4K HEVC DV, DVB fragment (native VLC fails the first four too) | same five |
| Time to first picture (median) | ~100 ms | ~400 ms (screenshot polling, ±250 ms) |

So the vendored VideoLabs binary *does* play legacy formats well — it is real libvlc. What it
lacks is everything around it: it cannot be rebuilt or updated (VLC master has moved two years
since), has no libass (so no styled ASS/SSA), no probe/thumbnail API, no documented JS API,
and its A/V and color handling come from 2022-era patches that were never upstreamed.


| | libvlc-wasm | addyosmani/vlc.js | addyosmani/webvlc |
|---|---|---|---|
| Engine | VLC 4 master, rebuilt from source (pinned) | VLC 4.0.0-dev binary from 2024 | the browser's `<video>` |
| Reproducible build | yes (Docker, CI, patches in repo) | no | n/a |
| Formats beyond the browser | 61/75 corpus samples; 40/45 video samples | 37/45 video samples (measured above) | none |
| Hardware decoding | WebCodecs H.264/HEVC/VP9/AV1, verified first frame, lossless fallback | `--codec=webcodec` forced; no software fallback in its configuration | browser |
| A/V sync | VLC clock driven by the worklet's real play position | VideoLabs' emworklet aout | browser |
| Subtitles | libass + bundled font, SRT/VTT/VobSub/DVB/608, external files | no libass in the binary | WebVTT via `<track>` |
| Headless probe / thumbnails | yes (browser and Node) | no | no |
| Transcode / remux / record | yes, optional `sout` build (VP8/Opus WebM, MP4, Ogg, MP3…) | no | no |
| API | typed `createVLC`/`Player`, `<vlc-player>`, events, ~60 operations | demo-internal wrapper | React component |
| Runs in Safari / Firefox | yes (tested WebKit, Firefox) | untested upstream; needs COEP credentialless | yes |

## Other browser media packages

| | what it is | plays in a page | obscure containers/codecs | subtitles rendered | size (wasm/npm) |
|---|---|---|---|---|---|
| **libvlc-wasm** | VLC 4 player engine | yes: canvas + Web Audio, VLC's clock | yes (VLC demuxers + FFmpeg + gme/modplug/fluidsynth) | yes (libass, freetype) | 25 MB raw / ~10 MB gzip |
| [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) 0.12 | FFmpeg CLI in wasm | no: transcode, then hand the result to `<video>` | yes (FFmpeg) | burn-in only, via transcode | 31 MB raw / ~10 MB gzip |
| [libav.js](https://github.com/Yahweasel/libav.js) 6.10 | FFmpeg's libraries with a JS API | no (you drive demux/decode yourself) | configurable variants | no | variants 1–15 MB |
| [mediabunny](https://github.com/Vanilagy/mediabunny) 1.60 | TS demux/mux + WebCodecs | via your own rendering | MP4/MOV/WebM/MKV/Ogg/WAV/MP3/ADTS/FLAC only; codecs = WebCodecs | no | ~10 MB npm, no wasm |
| [web-demuxer](https://github.com/bilibili/web-demuxer) 4.0 | FFmpeg demuxers in wasm + WebCodecs | via your own rendering | many containers, but only codecs WebCodecs decodes | no | ~4 MB |
| [ogv.js](https://github.com/bvibber/ogv.js) 1.9 | Ogg/WebM (Theora, VP8/9, AV1, Vorbis, Opus) decoders | yes | Ogg/WebM only | no | ~4 MB |
| [jsmpeg](https://github.com/phoboslab/jsmpeg) | MPEG-1 video + MP2 audio in JS | yes | MPEG-TS/MPEG-1 only | no | small |
| hls.js / shaka / dash.js | adaptive streaming via MSE | yes | only what MSE plays | WebVTT/TTML | 0.1–90 MB npm |
| chiptune3 / libopenmpt builds | tracker playback | audio | tracker formats only | n/a | ~1.5 MB |

What sets libvlc-wasm apart is that it is a **player**, not a toolkit: it brings VLC's own
demuxers (many predate FFmpeg's support, e.g. its Matroska, TS and ASF handling), its clock and
A/V sync, its audio pipeline (resampling, time-stretch, EQ, downmix), libass subtitle rendering,
filters, chapters/titles/programs and the non-FFmpeg decoders (game music, trackers, MIDI) behind
one API, and uses the platform's hardware decoders where they exist. ffmpeg.wasm and libav.js can
*decode* most of the same media, but playing it means building the rest yourself (or
transcoding first, which costs seconds to minutes before the first frame).

## Measured against ffmpeg.wasm

Same page, same Chrome, same clips ([bench/results/RESULTS.md](../results/RESULTS.md)).
ffmpeg.wasm numbers are decode-only (`-f null`); libvlc-wasm's include the whole player
(demux, decode, A/V pipeline, frame copy, WebGL upload), so the comparison favours ffmpeg.wasm.

| 1080p | libvlc-wasm software, 1 / 4 threads | libvlc-wasm + WebCodecs | ffmpeg.wasm 0.12 (mt), 1 / 4 threads |
|---|---|---|---|
| H.264 | 75 / 214 fps | 510 fps | 67 / 200 fps |
| HEVC | 197 / 423 fps | 517 fps | 125 / 298 fps |
| VP9 | 161 / 295 fps | 584 fps | 150 / 322 fps |
| AV1 | 89 / 249 fps | 482 fps | no decoder in the build |
| MPEG-2 | 469 / 497 fps (player ceiling) | — | 593 / 1363 fps |
| MPEG-4 ASP | 341 / 343 fps | — | 450 / 1186 fps |

On modern codecs libvlc-wasm is as fast or faster *while playing*, and WebCodecs takes over
entirely where the browser has a decoder. Likely reasons for the software gap, not isolated here:
this build autovectorizes with `-msimd128` and uses FFmpeg 9.0 (VLC's contrib pin) with emsdk 6,
while ffmpeg.wasm 0.12.10 is FFmpeg 5.1 built with emsdk 3.1.40 and no SIMD. On cheap intra/MPEG-era codecs ffmpeg.wasm's raw decode is faster; there
libvlc-wasm is bounded by per-frame player work, still 10–15x real time at 1080p30.

**Time to first frame** for a file the browser can't play (RealVideo 4, 2 MB): libvlc-wasm
**21 ms** after `open()`; ffmpeg.wasm 0.2 s to load, then transcoding before `<video>` can show
anything (0.7 s for 10 s of video at ~20x real time, i.e. about 6 minutes for a two-hour film).


## Every "VLC in the browser" port, measured the same way

Measured 2026-09-27 on the same machine and Chrome, headless and muted. Each harness opens the
sample through the port's own player page, then for 6 s screenshots its canvas (or `<video>`)
every 250 ms and counts a picture when the luma variance goes above 20 (the method
`vlcjs.mjs` uses). The sample set is the one `vlcjs.mjs` uses: 55 video samples, meaning
45 corpus files, 9 everyday files and the generated H.264/Opus/ASS control. The new
harnesses also run the 35 audio-only files. Audio counts as "audible" when the port's Web Audio
graph carries a signal above 1e-3 RMS. The harness hooks an `AnalyserNode` onto whatever
connects to the destination, so nothing reaches the speakers. For webvlc it reads the
`<video>`/`<audio>` element through `captureStream()`, and falls back to Chrome's
decoded-audio-bytes counter. Audio is counted over the 71 samples that have an audio track.
Harnesses: `bench/compare/{vlcjs,krowemoh,jbk,webvlc}.mjs`. Results sit in the matching
`*-results.json`.

| Port | What it is | Runnable today? | Video shown (all / excl. everyday) | Audible | Median first picture | Notable failures |
|---|---|---|---|---|---|---|
| [addyosmani/vlc.js](https://github.com/addyosmani/vlc.js) | Videolabs' prebuilt VLC 4.0.0-dev wasm (2024-03-07), WebCodecs + GL/OffscreenCanvas, custom UI | yes (prebuilt in repo) | 47/55 / 38/46 | not measured | 394 ms | MS Screen 2, Smacker, FLIC ×2, Vivo, PSX STR, DVB fragment, HEVC DV 1-frame |
| [Krowemoh/vlc.js](https://github.com/Krowemoh/vlc.js) (2024) | the **same** wasm/JS files as addyosmani (identical SHA-1s), plus a ~100-line `VLCPlayer()` wrapper | yes, but its `index.html` example is a SyntaxError (missing comma after `source:`). Measured with that one comma added | 48/55 / 39/46 | 57/71 | 455 ms | same list as addyosmani, except the HEVC DV frame, which showed here (borderline sample) |
| [jbk/vlc.js](https://code.videolan.org/jbk/vlc.js), published demo | jbk's `incoming` `vlc.html` UI, served at videolabs.io/communication/vlcjs-demo with the same 2024 wasm | yes (the demo is still online and was mirrored locally) | 48/55 / 39/46 | 56/71 | 438 ms | same as Krowemoh |
| jbk/vlc.js, built from source | `incoming` (2022-10): VLC 4.0.0-dev `06e361b1` (2022-04-15) + 82 patches, emsdk 3.1.18, ASYNCIFY + pthreads, 26.9 MB wasm | **yes, with 2 fixes**: emsdk tag pin (the image's python is 3.9) and glslang `master`→`main`. ~40 min in its 2022 CI image under amd64 emulation | 48/55 / 39/46 | 57/71 | 447 ms | identical to the 2024 binary, sample for sample |
| jbk/vlc.js 2017 `asm.js` branch | the original asm.js PoC (fastcomp emscripten + patched OpenAL, VLC of 2017) | **not attempted**: no artifacts exist, and it needs a 2017 fastcomp toolchain plus 23 emscripten patches | — | — | — | — |
| [addyosmani/webvlc](https://github.com/addyosmani/webvlc) | React UI over the browser's `<video>`/`<audio>`. **Confirmed: no wasm, no libvlc** (the only "WASM" in the source is a comment about butterchurn) | yes (production build, as on webvlc.addy.ie) | 10/55 / 3/46 | 17/71 | 351 ms | its extension allow-list refuses 51/90 files (.rm, .wmv, .flv, .ts, .vob, trackers…). It never loads the **first** video opened in a page (measured after re-opening). `.opus` is refused by its `audio/opus` MIME hint, although a bare `<audio>` plays it |

What this shows:

- **There is effectively one VLC-in-the-browser binary.** Three of the four "ports" ship the
  same Videolabs 2024 `experimental.wasm`. The only other one is jbk's `incoming` branch
  rebuilt today, and it plays exactly the same samples. jbk/vlc.js *can* still be rebuilt:
  two bitrot fixes, recipe in the header of `jbk.mjs`.
- **Failures shared by every VLC build here:** MS Screen 2, Smacker, both FLIC files, Vivo, PSX
  STR and the DVB fragment show no picture. On audio, DTS-in-TS, 5.1 AC-3 ("Max number of
  channels of the browser is 2", a downmix bug in the 2022 aout patch), Shorten, VGM, SID, MIDI
  and every tracker file (MOD/XM/S3M/IT) are silent. The audio track of DivX 5+MP3 and VP5+Speex
  is silent too, although their video shows. The tracker, SID, VGM and MIDI failures happen with
  and without a file extension (the Krowemoh wrapper names every file `Video`), so they are
  missing modules, not probing.
- **webvlc is Chrome's native support behind a UI.** Every file it failed on was also tried in a
  bare `<video>`/`<audio>`. None showed a picture Chrome could not otherwise show. The only
  file it lost to its own UI is `.opus` (plus the first-video bug above). A bare element also
  played audio from Sorenson 1, MPEG-4 ASP+Vorbis and ProRes+PCM, without video.
- **First-picture times** are all bounded by the 250 ms screenshot polling (±250 ms). The VLC
  ports land at 400–450 ms, and native `<video>` at ~350 ms by the same method.
- addyosmani's numbers come from the current `vlcjs-results.json` (run 2026-09-27 16:01 UTC,
  38/46 excluding everyday). That run is newer than the 37/45 quoted above. The HEVC Dolby
  Vision sample is a single frame and flips between runs of the identical binary.
