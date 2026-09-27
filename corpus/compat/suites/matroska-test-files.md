# Matroska test suite (IETF CELLAR): compatibility matrix

The eight official Matroska test files: basic, non-default timecodes, header stripping, live (no cues), multiple audio/subtitle tracks, EBML void/junk, lacing variants, and an audio-less/damaged file.

- Source: https://github.com/ietf-wg-cellar/matroska-test-files/tree/e6965e5ca666322ed93e2748a10a4f132309e005 (about: https://github.com/ietf-wg-cellar/matroska-test-files)
- Licence: see the repo (test clips from Elephants Dream / Big Buck Bunny, CC-BY)
- Fetched: GitHub tree listing at e6965e5ca666322ed93e2748a10a4f132309e005; raw.githubusercontent.com per file.
- Subset: all 8 files (about 185 MB).

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=matroska-test-files`. Definition: `corpus/suites/matroska-test-files.json`.
Raw per-file results are in `suites/matroska-test-files-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`matroska-test-files-matrix.json`, `matroska-test-files-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 8**: the files that native FFmpeg **or** native VLC 3 plays, out of 8 media files (8 files
in all; 0 media files play in neither and are listed at the end, not counted). 0 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 8 (100%) | 8 |
| FFmpeg (ffmpeg version 9.0.2) | 8 (100%) | 8 |
| VLC 3.0.24 | 8 (100%) | 8 |
| Chromium native | 8 (100%) | 8 |
| WebKit native | 0 (0%) | 8 |
| Firefox native | 4 (50%) | 8 |

0 union files fail in libvlc-wasm; 0 of them play when retried with `:demux=avformat`,
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
| **all** | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 8 (100%) | 0 (0%) | 4 (50%) | 0 |
| test_files | 8 | 8 (100%) | 8 (100%) | 8 (100%) | 8 (100%) | 0 (0%) | 4 (50%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (0)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

## Unplayable by all (0, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

