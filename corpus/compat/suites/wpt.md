# Web Platform Tests media files: compatibility matrix

The media files the web-platform-tests suites for <video>/<audio> (media/), Media Source Extensions (media-source/) and WebCodecs (webcodecs/) use. Small clips browsers are expected to play.

- Source: https://github.com/web-platform-tests/wpt/tree/f085a1efc1f58fbe263d384b1e335d656fe58e66 (about: https://github.com/web-platform-tests/wpt/tree/master/media)
- Licence: BSD-3-Clause (web-platform-tests); media under their own free licences
- Fetched: GitHub tree listing of media/, media-source/, webcodecs/ at f085a1efc1f58fbe263d384b1e335d656fe58e66; raw.githubusercontent.com per file.
- Subset: every audio/video file in those three folders (images, captions and manifests left out).

Generated 2026-09-27 by `node corpus/compat/suite.mjs --suite=wpt`. Definition: `corpus/suites/wpt.json`.
Raw per-file results are in `suites/wpt-{inventory,ffmpeg,vlc,wasm,native}.json` (keyed by path under `corpus/`);
`wpt-matrix.json`, `wpt-summary.json` and this page are regenerated from them with `--tool=summary`.

## Headline

**N = 83**: the files that native FFmpeg **or** native VLC 3 plays, out of 87 media files (88 files
in all; 4 media files play in neither and are listed at the end, not counted). 0 union files
are ones ffprobe does not recognise but VLC plays: every probed file is tried by every tool, whatever ffprobe says.

| tool | plays | of N |
|---|--:|--:|
| libvlc-wasm (Chromium) | 83 (100%) | 83 |
| FFmpeg (ffmpeg version 9.0.2) | 83 (100%) | 83 |
| VLC 3.0.24 | 81 (98%) | 83 |
| Chromium native | 80 (96%) | 83 |
| WebKit native | 81 (98%) | 83 |
| Firefox native | 79 (95%) | 83 |

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
| **all** | 83 | 83 (100%) | 81 (98%) | 83 (100%) | 80 (96%) | 81 (98%) | 79 (95%) | 4 |
| media | 33 | 33 (100%) | 32 (97%) | 33 (100%) | 31 (94%) | 31 (94%) | 30 (91%) | 0 |
| media-source | 28 | 28 (100%) | 28 (100%) | 28 (100%) | 28 (100%) | 28 (100%) | 28 (100%) | 4 |
| webcodecs | 22 | 22 (100%) | 21 (95%) | 22 (100%) | 21 (95%) | 22 (100%) | 21 (95%) | 0 |

## Actionable: libvlc-wasm fails where FFmpeg or VLC plays (0)

Grouped by probable cause: first whether naming the ES demuxer or `:demux=avformat` fixes it, else a heuristic over the libvlc-wasm logs of both attempts (`classify()` in suite.mjs).

## Unplayable by all (4, not counted)

Media files neither native FFmpeg nor native VLC 3 plays.

- **media-source** (4): `media-source/mp4/h264-starvation-init.mp4`, `media-source/mp4/invalid-codec.mp4`, `media-source/mp4/test-two-audiotracks-opus.mp4`, `media-source/webm/invalid-codec.webm`
