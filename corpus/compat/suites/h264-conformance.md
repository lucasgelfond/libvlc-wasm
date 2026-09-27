# H.264/AVC conformance bitstreams (JVT): compatibility matrix

The ITU-T H.264.1 / JVT conformance bitstreams (baseline, main, extended, high profiles; CAVLC/CABAC, interlaced, MBAFF/PAFF, FMO/ASO, multi-slice), as FFmpeg's FATE suite carries them: raw Annex B elementary streams.

- Source: https://fate-suite.ffmpeg.org/h264-conformance/ (about: https://www.itu.int/wftp3/av-arch/jvt-site/draft_conformance/)
- Licence: ITU-T conformance material, redistributed in FATE for testing
- Derived from the FATE measurements (`fate-*.json`), folders `h264-conformance`: nothing is re-measured.

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=h264-conformance`. Definition: `corpus/suites/h264-conformance.json`.
Rows and counts come from the FATE caches.


## Headline

**N = 192**: the files that native FFmpeg **or** native VLC 3 plays, out of 195 media files (197 files
in all; 3 media files play in neither and are listed at the end, not counted). 0 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 192 (100%) | 192 |
| FFmpeg (ffmpeg version 9.0.2) | 192 (100%) | 192 |
| VLC 3.0.24 | 116 (60%) | 192 |
| Chromium native | 0 (0%) | 192 |
| WebKit native | 0 (0%) | 192 |
| Firefox native | 0 (0%) | 192 |

0 union files fail in libvlc-wasm; 0 of them play when retried with `:demux=avformat`,
and 0 raw elementary streams play when their ES demuxer is named (`:demux=h264`, `:demux=hevc`, ...).

## How each column is measured

A file is **media** when `ffprobe` finds a video or audio stream (checksums, reference text and headerless raw dumps
are not). A tool **plays** a file when it has video and a picture came out, or it has audio and sound came out:

- **FFmpeg**: `ffmpeg -i f -map 0:V:0? -map 0:a:0? -t 5 -af volumedetect -f null -`; frames > 0 or samples > 0.
- **VLC 3** (VLC.app): headless, `--vout=stats --aout=afile` (to a WAV file), `--run-time=4`; a picture reached the vout ("VOUT got") or audio was written. Retried with `--codec=avcodec,none` when a video file shows nothing.
- **libvlc-wasm** (libvlc-wasm 4.0.0-dev Otto Chriek in Chromium, 2 s per file): `window.harness.playCase` in muted headless Chromium; video = a frame drawn with content (variance > 2 or > 1 distinct frame), audio = audible output (peak > 0.003, or any output when FFmpeg found the start near-silent). Same criteria as `tests/verify-corpus.mjs`. Each failure is retried once with `:demux=avformat`, and a raw elementary stream also with its ES demuxer (`:demux=h264`, `hevc`, `vc1`, `m4v`, `es`); those results are reported, not counted.
- **chromium / webkit / firefox**: the harness `nativeCheck`: `<video>`/`<audio>` reaches `loadeddata` within 4 s (muted).

Caveats: FATE is a decoder conformance suite, not a playback corpus. Many files are deliberately broken, truncated,
single-frame or headerless bitstreams, and a still image counts as media. "Plays" is only "something came out", not a bit-exact decode.
Native VLC 3 is run on the file as given, so it shares libvlc-wasm's blind spot for raw `.264`/`.bit`/`.jsv` streams
(it falls back to the MPEG-PS demuxer), and it cannot decode most still-image formats FFmpeg can.

## Where libvlc-wasm trails native

| folder | N | best of FFmpeg/VLC | libvlc-wasm | gap |
|---|--:|--:|--:|--:|

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 192 | 192 (100%) | 116 (60%) | 192 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 3 |
| h264-conformance | 192 | 192 (100%) | 116 (60%) | 192 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 3 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (0)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

## Unplayable by all (3, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **h264-conformance** (3): `FM1_BT_B.h264`, `FM2_SVA_B.264`, `FM2_SVA_C.264`
