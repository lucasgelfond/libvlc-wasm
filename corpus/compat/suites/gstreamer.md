# GStreamer integration test-suite media: compatibility matrix

The media GStreamer's gst-validate integration test suite plays, seeks and switches tracks in (defaults/: avi, flac, flv, h265, matroska, mp4/mov, mpeg-ps/ts, mxf, ogg, webm, asf), plus the older small/ and medium/ sample directories next to it.

- Source: https://gstreamer.freedesktop.org/data/media/ (about: https://gitlab.freedesktop.org/gstreamer/gstreamer/-/tree/main/subprojects/gst-integration-testsuites)
- Licence: mixed free sample media (Blender open movies, samples.mplayerhq.hu/multimedia.cx samples, GStreamer-generated clips)
- Fetched: Apache directory listings of gst-integration-testsuite/defaults/, small/ and medium/ (crawled one page at a time), files downloaded from there.
- Subset: every playable file; left out: per-frame reference PNGs and image sequences, HLS/DASH segment trees (bipbop, exMPD_BIP_TC1: need a streaming server), subtitles, scenarios, .media_info, redirect.mp4 and the noise file.

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=gstreamer`. Definition: `corpus/suites/gstreamer.json`.
Raw per-file results are in `suites/gstreamer-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`gstreamer-matrix.json`, `gstreamer-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 98**: the files that native FFmpeg **or** native VLC 3 plays, out of 96 media files (101 files
in all; 0 media files play in neither and are listed at the end, not counted). 2 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 97 (99%) | 98 |
| FFmpeg (ffmpeg version 9.0.2) | 96 (98%) | 98 |
| VLC 3.0.24 | 92 (94%) | 98 |
| Chromium native | 46 (47%) | 98 |
| WebKit native | 52 (53%) | 98 |
| Firefox native | 38 (39%) | 98 |

1 union files fail in libvlc-wasm; 0 of them play when retried with `:demux=avformat`,
and 0 raw elementary streams play when their ES demuxer is named (`:demux=h264`, `:demux=hevc`, ...).

## How each column is measured

A file is **media** when `ffprobe` finds a video or audio stream (checksums, reference text and headerless raw dumps
are not). A tool **plays** a file when it has video and a picture came out, or it has audio and sound came out:

- **FFmpeg**: `ffmpeg -i f -map 0:V:0? -map 0:a:0? -t 5 -af volumedetect -f null -`; frames > 0 or samples > 0.
- **VLC 3** (VLC.app): headless, `--vout=stats --aout=afile` (to a WAV file), `--run-time=4`; a picture reached the vout ("VOUT got") or audio was written. Retried with `--codec=avcodec,none` when a video file shows nothing.
- **libvlc-wasm** (libvlc-wasm 4.0.0-dev Otto Chriek in Chromium, 2 s per file): `window.harness.playCase` in muted headless Chromium; video = a frame drawn with content (variance > 2 or > 1 distinct frame), audio = audible output (peak > 0.003, or any output when FFmpeg found the start near-silent). Same criteria as `tests/verify-corpus.mjs`. Each failure is retried once with `:demux=avformat`, and a raw elementary stream also with its ES demuxer (`:demux=h264`, `hevc`, `vc1`, `m4v`, `es`); those results are reported, not counted.
- **chromium / webkit / firefox**: the harness `nativeCheck`: `<video>`/`<audio>` reaches `loadeddata` within 4 s (muted).

Caveats: many suite files are deliberately broken, truncated,
single-frame or headerless bitstreams, and a still image counts as media. "Plays" is only "something came out", not a bit-exact decode.
Native VLC 3 is run on the file as given, so it shares libvlc-wasm's blind spot for raw `.264`/`.bit`/`.jsv` streams
(it falls back to the MPEG-PS demuxer), and it cannot decode most still-image formats FFmpeg can.

## Where libvlc-wasm trails native

| folder | N | best of FFmpeg/VLC | libvlc-wasm | gap |
|---|--:|--:|--:|--:|

## Per folder

| folder | N | ffmpeg | VLC 3 | libvlc-wasm | chromium | webkit | firefox | unplayable |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| **all** | 98 | 96 (98%) | 92 (94%) | 97 (99%) | 46 (47%) | 52 (53%) | 38 (39%) | 0 |
| defaults/avi | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 1 (33%) | 0 (0%) | 0 |
| defaults/flac | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 1 (100%) | 0 |
| defaults/flv | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| defaults/h265 | 1 | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| defaults/matroska | 11 | 11 (100%) | 11 (100%) | 11 (100%) | 8 (73%) | 0 (0%) | 6 (55%) | 0 |
| defaults/mp4 | 18 | 18 (100%) | 15 (83%) | 18 (100%) | 14 (78%) | 15 (83%) | 10 (56%) | 0 |
| defaults/mpegps | 1 | 1 (100%) | 1 (100%) | 1 (100%) | 0 (0%) | 1 (100%) | 0 (0%) | 0 |
| defaults/mpegts | 3 | 3 (100%) | 3 (100%) | 3 (100%) | 0 (0%) | 3 (100%) | 0 (0%) | 0 |
| defaults/mxf | 7 | 7 (100%) | 7 (100%) | 7 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| defaults/ogg | 4 | 4 (100%) | 4 (100%) | 4 (100%) | 3 (75%) | 3 (75%) | 3 (75%) | 0 |
| defaults/webm | 5 | 5 (100%) | 5 (100%) | 5 (100%) | 5 (100%) | 5 (100%) | 5 (100%) | 0 |
| defaults/wmv-asf | 2 | 2 (100%) | 2 (100%) | 2 (100%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 |
| medium | 17 | 17 (100%) | 17 (100%) | 17 (100%) | 4 (24%) | 9 (53%) | 3 (18%) | 0 |
| small | 24 | 22 (92%) | 22 (92%) | 23 (96%) | 11 (46%) | 14 (58%) | 10 (42%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (1)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

### decoder produced no picture (buffer deadlock prevented) (1)

| file | container | video | audio | FFmpeg | VLC | avformat retry | ES demux retry | libvlc-wasm log |
|---|---|---|---|---|---|---|---|---|
| suites/gstreamer/small/napster.swf | swf |  | mp3 | yes | no | no | — | error: libvlc demux: Playback failure |

## Unplayable by all (0, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

